import fs from 'node:fs';
import path from 'node:path';
import { outlineSource, type OutlineNode } from '../../shared/source/jsx';
import {
  RETAGGABLE_TAGS,
  type AuditReport,
  type Breakpoint,
  type EditCommand,
  type EditResult,
  type FileChange,
  type FileNode,
  type GitStatus,
  type GoLiveResult,
  type ImportResult,
  type InsertKind,
  type ProjectInfo,
  type SourceElementInfo,
} from '../../shared/types';
import { buildDesignContext, buildDesignSystemBrief, describeStyle } from '../../shared/design-context';
import { normalizePath, type PageRouting, type ProjectPagesState } from '../../shared/project-config';
import type { VariantRecord } from '../../shared/variants';
import { McpToolError, type McpContent, type McpTool } from './mcp';
import { designSystemStatus, proposeTokenChange, tokenImpact } from './design-system';
import { remoteWebUrl } from './git';
import { isEditablePath, listTree, safeResolve } from './project';

/** What the tools need from the running app. */
export interface McpContext {
  project(): ProjectInfo | null;
  /** Pages and design direction from `.opencanvas/project.json` (defaults when absent). */
  pages(): ProjectPagesState | null;
  /** Data URL of a stored reference image. */
  referenceImage(rel: string): string;
  /** Applies an edit and records it in the editor's undo history. */
  edit(command: EditCommand, label: string): EditResult;
  inspect(id: string): SourceElementInfo | { error: string };
  /** Writes a text file and records it in the undo history. */
  writeFile(rel: string, content: string, label: string): FileChange;
  importFiles(sources: string[], dir: string): ImportResult;
  /** `pagePath` is a URL path such as "/about" (default "/"). */
  screenshot(width: number, fullPage: boolean, pagePath?: string): Promise<Buffer>;
  /** Asks the editor window to do something only it can (undo stack, selection). */
  renderer(action: 'undo' | 'redo' | 'select' | 'selection' | 'audit', arg?: unknown): Promise<unknown>;
  git: {
    status(): Promise<GitStatus>;
    init(): Promise<void>;
    commit(message: string): Promise<void>;
    setRemote(url: string): Promise<string>;
    /** Creates a GitHub repository with the user's signed-in account and connects it as origin. */
    createRepo(name: string, isPrivate: boolean): Promise<{ url: string; htmlUrl: string }>;
    push(): Promise<void>;
    /** Gets the pushed commit live on Vercel. */
    goLive(): Promise<GoLiveResult>;
  };
  /** Optional: variant proposal store (Milestone 3). */
  variants?: {
    propose(args: { setId?: string; elementId?: string; label: string; notes?: string; jsx: string }): VariantRecord;
    list(): VariantRecord[];
    apply(id: string): { ok: boolean; error?: string; selectId?: string | null };
  };
}

/** Read-only tools plus propose_variant for in-app variant generation turns. */
export const VARIANT_TOOL_NAMES = [
  'get_project',
  'get_design_direction',
  'get_design_system',
  'get_outline',
  'inspect_element',
  'read_file',
  'screenshot',
  'propose_variant',
] as const;

export function createVariantTools(ctx: McpContext): McpTool[] {
  const all = createMcpTools(ctx);
  const allow = new Set<string>(VARIANT_TOOL_NAMES);
  return all.filter((t) => allow.has(t.name));
}

export const MCP_INSTRUCTIONS = `OpenCanvas is a visual editor for React + Vite projects. These tools edit the project that is open in the app; every change shows up live on the canvas and can be undone by the user (or with the undo tool).

Workflow:
1. Call get_project, then get_outline to see the JSX element tree. Element ids look like "src/App.jsx:12:6" (file:line:column of the opening tag). Before designing anything new, call get_design_direction and get_design_system. Prefer existing semantic tokens (var(--…)) and registered components; do not invent duplicate tokens. list_pages shows every page and the file that renders it.
2. Ids shift whenever a file changes. Every edit returns the new outline of the files it touched, so use ids from the latest result only.
3. Build structure with insert_jsx (any JSX element, inserted inside the target when it's a container such as div/section/header/nav/ul/form, otherwise after it) or insert_element (preset blocks).
4. Style with set_styles. It writes CSS rules to the project's open-canvas.css keyed by a data-oc attribute, per breakpoint (base, tablet, mobile) and state (default, hover). Prefer var(--token) from get_design_system over new hex/rgb values. For broad token changes, call propose_token_change with apply=false (or design_system_impact), summarize scope to the user, then call propose_token_change with apply=true.
5. Check your work with screenshot (desktop ~1440, tablet ~834, mobile ~390; pass "page" for pages other than "/").
6. To save or share the site, use git_status, git_commit and git_publish (creates or connects a GitHub repository and pushes). go_live does all of that and then publishes on Vercel.
7. To find bugs, call run_audit. It tests the live page at every screen size and returns each problem with a suggested fix and the element id; fix them, then run it again to confirm.`;

const BREAKPOINTS: Breakpoint[] = ['base', 'tablet', 'mobile'];
const INSERT_KINDS: InsertKind[] = ['div', 'section', 'flex', 'grid', 'heading', 'paragraph', 'image', 'button', 'link', 'header', 'nav', 'footer', 'list', 'form', 'input', 'textarea'];
const SOURCE_RE = /\.(jsx|tsx)$/;
const MAX_READ = 400_000;
const MAX_REFERENCE_IMAGES = 6;
const ROUTING_LABEL: Record<PageRouting, string> = {
  single: 'single page (OpenCanvas adds routing when a second page is created)',
  managed: 'managed by OpenCanvas (src/routes file, no router dependency)',
  'react-router': 'React Router (pages come from the project’s routes)',
  next: 'Next.js file-based routing',
  unsupported: 'not supported for page management',
};

const text = (value: string): McpContent => ({ type: 'text', text: value });
const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const ids = (description: string) => ({ type: 'array', items: { type: 'string' }, minItems: 1, description });

function requireProject(ctx: McpContext): ProjectInfo {
  const project = ctx.project();
  if (!project) throw new McpToolError('No project is open in OpenCanvas. Open or create one in the app first.');
  return project;
}

function requireString(args: Record<string, any>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) throw new McpToolError(`"${name}" is required.`);
  return value;
}

function requireIds(args: Record<string, any>, name = 'ids'): string[] {
  const value = args[name];
  if (!Array.isArray(value) || !value.length || value.some((v) => typeof v !== 'string')) throw new McpToolError(`"${name}" must be a non-empty array of element ids.`);
  return value;
}

function flatFiles(node: FileNode, out: string[] = []): string[] {
  if (node.type === 'file') out.push(node.path);
  for (const child of node.children ?? []) flatFiles(child, out);
  return out;
}

function renderOutline(nodes: OutlineNode[], depth = 0, lines: string[] = []): string[] {
  for (const node of nodes) {
    const parts = [`${'  '.repeat(depth)}<${node.tag}>`];
    if (node.component) parts.push('(component)');
    if (node.name) parts.push(`"${node.name}"`);
    parts.push(node.id);
    if (node.text) parts.push(`text=${JSON.stringify(node.text)}`);
    lines.push(parts.join(' '));
    renderOutline(node.children, depth + 1, lines);
  }
  return lines;
}

function outlineFile(root: string, rel: string): string {
  try {
    const code = fs.readFileSync(safeResolve(root, rel), 'utf8');
    const lines = renderOutline(outlineSource(code, rel, rel));
    return `${rel}\n${lines.length ? lines.join('\n') : '  (no JSX elements)'}`;
  } catch (err) {
    return `${rel}\n  (could not parse: ${(err as Error).message})`;
  }
}

function sourceFiles(project: ProjectInfo): string[] {
  const files = flatFiles(listTree(project.root)).filter((f) => SOURCE_RE.test(f) && isEditablePath(project, f));
  const app = files.find((f) => /^src\/App\.(jsx|tsx)$/.test(f));
  return app ? [app, ...files.filter((f) => f !== app)] : files;
}

function editResult(ctx: McpContext, result: EditResult, summary: string): McpContent[] {
  if (!result.ok) throw new McpToolError(result.error ?? 'The edit failed.');
  const project = requireProject(ctx);
  const touched = [...new Set(result.changes.map((c) => c.path))];
  const lines = [result.changes.length ? summary : `${summary} (nothing changed)`];
  if (result.selectId) lines.push(`Element id: ${result.selectId}`);
  if (touched.length) lines.push(`Files: ${touched.join(', ')}`);
  const outlines = touched.filter((f) => SOURCE_RE.test(f)).map((f) => outlineFile(project.root, f));
  if (outlines.length) lines.push('', 'Updated outline (use these ids from now on):', ...outlines);
  return [text(lines.join('\n'))];
}

function describeGit(s: GitStatus): string {
  if (!s.installed) return 'Git is not installed on this computer.';
  if (!s.repo) return 'Not a git repository yet. git_commit or git_publish will create one.';
  const lines = [
    `Branch: ${s.branch ?? '(detached)'}`,
    `Remote: ${s.remote ? `${s.remote}${s.upstream ? ` (tracking ${s.upstream}${s.ahead ? `, ${s.ahead} to push` : ''}${s.behind ? `, ${s.behind} to pull` : ''})` : ' (not pushed yet)'}` : 'none'}`,
    `Last commit: ${s.lastCommit ? `${s.lastCommit.hash} ${s.lastCommit.message} (${s.lastCommit.when})` : 'none'}`,
    `Identity: ${s.identity ? `${s.identity.name} <${s.identity.email}>` : 'not set'}`,
  ];
  if (s.parentRepo) lines.push(`Inside the repository at ${s.parentRepo}`);
  lines.push(s.files.length ? `Changed files (${s.files.length}):\n${s.files.slice(0, 40).map((f) => `  ${f.state} ${f.path}`).join('\n')}` : 'No uncommitted changes.');
  return lines.join('\n');
}

async function ensureRepo(ctx: McpContext) {
  const status = await ctx.git.status();
  if (!status.installed) throw new McpToolError('Git is not installed. Install it from https://git-scm.com/download and restart OpenCanvas.');
  if (!status.identity) throw new McpToolError('Git doesn’t know who is committing. Ask the user to set their name and email in OpenCanvas’s Git menu.');
  if (!status.repo) await ctx.git.init();
}

async function publishToGithub(ctx: McpContext, args: Record<string, any>): Promise<string> {
  const project = requireProject(ctx);
  await ensureRepo(ctx);
  let status = await ctx.git.status();
  if (status.files.length) {
    await ctx.git.commit(typeof args.message === 'string' && args.message.trim() ? args.message : 'Publish from OpenCanvas');
    status = await ctx.git.status();
  }
  if (!status.lastCommit) throw new McpToolError('There is nothing to publish yet — the project has no files to commit.');
  let created: string | null = null;
  if (typeof args.remote === 'string' && args.remote.trim()) await ctx.git.setRemote(args.remote);
  else if (!status.remote) {
    if (status.parentRepo) throw new McpToolError(`This folder is inside the repository at ${status.parentRepo}. Pass "remote" to publish that repository, or move the project out of it.`);
    const name = typeof args.repo_name === 'string' && args.repo_name.trim() ? args.repo_name : project.name;
    created = (await ctx.git.createRepo(name, args.private !== false)).htmlUrl;
  }
  await ctx.git.push();
  status = await ctx.git.status();
  const web = status.remote ? remoteWebUrl(status.remote) : null;
  const lines = [created ? `Created ${created} and pushed.` : 'Pushed.'];
  if (web) lines.push(`Repository: ${web}`);
  return [...lines, '', describeGit(status)].join('\n');
}

function runEdit(ctx: McpContext, command: EditCommand, label: string, summary = label): McpContent[] {
  requireProject(ctx);
  return editResult(ctx, ctx.edit(command, label), summary);
}

export function createMcpTools(ctx: McpContext): McpTool[] {
  return [
    {
      name: 'get_project',
      title: 'Get project',
      description: 'Describes the project open in OpenCanvas: location, framework, entry and stylesheet files, breakpoints and preview status.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => {
        const p = requireProject(ctx);
        const state = ctx.pages();
        const direction = state?.config.direction;
        return [
          text(
            JSON.stringify(
              {
                name: p.name,
                root: p.root,
                framework: p.framework,
                editable: p.editable,
                entryFile: p.entryFile,
                stylesFile: p.stylesFile,
                breakpoints: { tablet: `max-width: ${p.breakpoints.tablet}px`, mobile: `max-width: ${p.breakpoints.mobile}px` },
                sourceFiles: sourceFiles(p),
                pages: state?.pages.map((pg) => ({ name: pg.name, path: pg.path, file: pg.file })) ?? [],
                direction: direction
                  ? { summary: describeStyle(direction.visualStyle), font: direction.font, iconPack: direction.iconPack, references: direction.references.length, designSystem: direction.designSystem?.file ?? null }
                  : null,
              },
              null,
              2,
            ),
          ),
        ];
      },
    },
    {
      name: 'get_design_direction',
      title: 'Get design direction',
      description:
        'The visual direction the user chose for this project: style (minimal↔expressive, casual↔professional), typeface, icon pack, imported design tokens and reference links. Uploaded reference images are returned as images. Follow it when designing.',
      inputSchema: { type: 'object', properties: { include_images: { type: 'boolean', description: 'Return uploaded reference images too (default true, at most 6)' } } },
      annotations: { readOnlyHint: true },
      run: (args) => {
        const p = requireProject(ctx);
        const state = ctx.pages();
        if (!state) throw new McpToolError('The project settings could not be read.');
        const direction = state.config.direction;
        const out: McpContent[] = [text(buildDesignContext(direction, { projectName: p.name, pages: state.pages }))];
        if (args.include_images !== false) {
          const refs = [...direction.references].sort((a, b) => Number(b.primary) - Number(a.primary)).filter((r) => r.imagePath);
          for (const r of refs.slice(0, MAX_REFERENCE_IMAGES)) {
            try {
              const match = /^data:([^;]+);base64,(.*)$/s.exec(ctx.referenceImage(r.imagePath!));
              if (match && match[1] !== 'image/svg+xml') out.push(text(`Reference: ${r.title}${r.note ? ` (${r.note})` : ''}`), { type: 'image', data: match[2], mimeType: match[1] });
            } catch {
              out.push(text(`Reference image ${r.imagePath} could not be read.`));
            }
          }
        }
        return out;
      },
    },
    {
      name: 'get_design_system',
      title: 'Get design system',
      description:
        'The project design-system engine: semantic/primitive tokens (with CSS variable names), themes, registered components, and validation issues. Prefer these tokens via var(--…) in set_styles. Call before inventing colors or components.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => {
        const p = requireProject(ctx);
        const status = designSystemStatus(p);
        const issues =
          status.issues.length === 0
            ? 'No validation issues.'
            : status.issues.map((i) => `- [${i.severity}] ${i.message}`).join('\n');
        return [text(`${buildDesignSystemBrief(status.document)}\n\n## Validation\n${issues}\n\nCSS file: ${status.cssFile}`)];
      },
    },
    {
      name: 'design_system_impact',
      title: 'Design system impact',
      description:
        'Who depends on a token (other tokens, components, style-file var() usages). Call before proposing a broad token change and summarize the impact to the user.',
      inputSchema: {
        type: 'object',
        properties: { token_id: { type: 'string', description: 'Token id or path, e.g. color.primary' } },
        required: ['token_id'],
      },
      annotations: { readOnlyHint: true },
      run: (args) => {
        const p = requireProject(ctx);
        const id = String(args.token_id ?? '').trim();
        if (!id) throw new McpToolError('token_id is required.');
        const impact = tokenImpact(p, id);
        return [
          text(
            [
              `Impact for ${impact.tokenId} (${impact.cssVar}):`,
              `- Dependent tokens: ${impact.dependentTokens.length ? impact.dependentTokens.join(', ') : 'none'}`,
              `- Components: ${impact.components.length ? impact.components.join(', ') : 'none'}`,
              `- Style file var() usages: ${impact.styleUsages}`,
              `- data-oc keys: ${impact.styleKeys.length ? impact.styleKeys.join(', ') : 'none'}`,
            ].join('\n'),
          ),
        ];
      },
    },
    {
      name: 'propose_token_change',
      title: 'Propose token change',
      description:
        'Preview or apply a design-system token update. Call with apply=false first; the result includes impact (dependent tokens, components, data-oc keys). After summarizing for the user, call again with apply=true to write .opencanvas/design-system.json and regenerate design-tokens.css.',
      inputSchema: {
        type: 'object',
        properties: {
          token_id: { type: 'string', description: 'Token id or path, e.g. color.primary' },
          value: { type: 'string', description: 'New value: literal (#hex, 16px, …), {alias.path}, or var(--token)' },
          apply: { type: 'boolean', description: 'false (default) = preview + impact only; true = write the change' },
          theme_id: { type: 'string', description: 'Optional theme override id (e.g. dark). Omit to change the default value.' },
          summary: { type: 'string', description: 'Optional history summary when applying' },
        },
        required: ['token_id', 'value'],
      },
      annotations: { readOnlyHint: false },
      run: (args) => {
        const p = requireProject(ctx);
        const tokenId = String(args.token_id ?? '').trim();
        const value = String(args.value ?? '').trim();
        if (!tokenId || !value) throw new McpToolError('token_id and value are required.');
        const result = proposeTokenChange(p, {
          tokenId,
          value,
          apply: !!args.apply,
          themeId: args.theme_id ? String(args.theme_id) : undefined,
          summary: args.summary ? String(args.summary) : undefined,
        });
        const impact = result.impact;
        return [
          text(
            [
              result.applied ? `Applied change to ${result.path}.` : `Proposed change to ${result.path} (not applied).`,
              `- ${result.previous} → ${result.next}`,
              `- Dependent tokens: ${impact.dependentTokens.length ? impact.dependentTokens.join(', ') : 'none'}`,
              `- Components: ${impact.components.length ? impact.components.join(', ') : 'none'}`,
              `- Style usages: ${impact.styleUsages}; data-oc: ${impact.styleKeys.length ? impact.styleKeys.join(', ') : 'none'}`,
              result.applied ? '' : 'Call again with apply=true after the user confirms.',
            ]
              .filter(Boolean)
              .join('\n'),
          ),
        ];
      },
    },
    {
      name: 'list_pages',
      title: 'List pages',
      description: 'Lists the project’s pages (URL path and the component file that renders each), and whether OpenCanvas can add pages in this project.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => {
        requireProject(ctx);
        const state = ctx.pages();
        if (!state) throw new McpToolError('The project settings could not be read.');
        const lines = state.pages.map((pg) => `${pg.path}  ${pg.name}${pg.file ? `  (${pg.file})` : ''}`);
        lines.push('', `Routing: ${ROUTING_LABEL[state.routing]}`);
        if (state.pagesNote) lines.push(state.pagesNote);
        if (state.routing === 'managed') lines.push('The routes file is generated by OpenCanvas. Ask the user to add pages from the Pages panel rather than editing it by hand.');
        return [text(lines.join('\n'))];
      },
    },
    {
      name: 'list_files',
      title: 'List files',
      description: 'Lists every file in the project (node_modules, .git and build output are skipped).',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => [text(flatFiles(listTree(requireProject(ctx).root)).join('\n'))],
    },
    {
      name: 'read_file',
      title: 'Read file',
      description: 'Reads a text file from the project.',
      inputSchema: { type: 'object', properties: { path: str('Project-relative path, e.g. src/App.jsx') }, required: ['path'] },
      annotations: { readOnlyHint: true },
      run: (args) => {
        const abs = safeResolve(requireProject(ctx).root, requireString(args, 'path'));
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new McpToolError(`${args.path} does not exist.`);
        if (fs.statSync(abs).size > MAX_READ) throw new McpToolError(`${args.path} is too large to read here.`);
        return [text(fs.readFileSync(abs, 'utf8'))];
      },
    },
    {
      name: 'write_file',
      title: 'Write file',
      description:
        'Creates or replaces a text file in the project (undoable in the app). Use it for new components or larger rewrites; prefer the element tools for small visual changes.',
      inputSchema: {
        type: 'object',
        properties: { path: str('Project-relative path, e.g. src/components/Hero.jsx'), content: str('Full file contents') },
        required: ['path', 'content'],
      },
      annotations: { destructiveHint: true },
      run: (args) => {
        const project = requireProject(ctx);
        const rel = requireString(args, 'path').replace(/\\/g, '/').replace(/^\.?\//, '');
        if (typeof args.content !== 'string') throw new McpToolError('"content" is required.');
        if (/(^|\/)(node_modules|\.git)(\/|$)/.test(rel)) throw new McpToolError('That location is off limits.');
        const change = ctx.writeFile(rel, args.content, `Write ${path.basename(rel)}`);
        const lines = [`${change.before === null ? 'Created' : 'Updated'} ${rel}.`];
        if (SOURCE_RE.test(rel)) lines.push('', outlineFile(project.root, rel));
        return [text(lines.join('\n'))];
      },
    },
    {
      name: 'get_outline',
      title: 'Get element outline',
      description:
        'Returns the JSX element tree of the project source files with the ids every element tool expects. Pass "file" to outline just one file. Components (capitalised tags) render elements from other files.',
      inputSchema: { type: 'object', properties: { file: str('Optional project-relative .jsx/.tsx file') } },
      annotations: { readOnlyHint: true },
      run: (args) => {
        const project = requireProject(ctx);
        const files = typeof args.file === 'string' && args.file ? [args.file] : sourceFiles(project);
        if (!files.length) return [text('No .jsx/.tsx files under src/.')];
        return [text(files.map((f) => outlineFile(project.root, f)).join('\n\n'))];
      },
    },
    {
      name: 'inspect_element',
      title: 'Inspect element',
      description: 'Shows an element’s tag, text, attributes and the styles OpenCanvas manages for it (per breakpoint, default and hover).',
      inputSchema: { type: 'object', properties: { id: str('Element id from get_outline') }, required: ['id'] },
      annotations: { readOnlyHint: true },
      run: (args) => {
        requireProject(ctx);
        const info = ctx.inspect(requireString(args, 'id'));
        if ('error' in info) throw new McpToolError(info.error);
        return [text(JSON.stringify(info, null, 2))];
      },
    },
    {
      name: 'get_selection',
      title: 'Get selection',
      description: 'Returns the element(s) the user has selected in OpenCanvas, so you can act on "this".',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: async () => {
        requireProject(ctx);
        return [text(JSON.stringify(await ctx.renderer('selection'), null, 2))];
      },
    },
    {
      name: 'run_audit',
      title: 'Run bug check',
      description:
        'Tests the running site in every canvas frame (desktop, tablet, mobile) and returns the problems found: JavaScript and console errors, build errors, broken images and links, failed requests, horizontal overflow, accessibility (alt text, labels, contrast, headings) and missing SEO tags. Each issue has a suggested fix and, when it is tied to an element, its id. Run it before fixing and again afterwards to confirm.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: async () => {
        requireProject(ctx);
        const report = (await ctx.renderer('audit')) as AuditReport;
        if (!report.issues.length) return [text(`No problems found on ${report.frames.map((f) => `${f.name} (${f.width}px)`).join(', ') || 'the page'}.`)];
        const lines = report.issues.map((issue) => {
          const where = [issue.id ? `element ${issue.id}${issue.name ? ` (${issue.name})` : ''}` : null, issue.frames.length ? `on ${issue.frames.join(', ')}` : null].filter(Boolean).join(' ');
          return `- [${issue.severity}] ${issue.title}${where ? ` — ${where}` : ''}${issue.detail ? `\n  ${issue.detail.replace(/\n/g, '\n  ')}` : ''}\n  Fix: ${issue.fix}`;
        });
        return [text(`${report.issues.length} problem(s) found, tested on ${report.frames.map((f) => `${f.name} (${f.width}px)`).join(', ') || 'no frames'}:\n\n${lines.join('\n')}`)];
      },
    },
    {
      name: 'select_element',
      title: 'Select element',
      description: 'Selects an element on the OpenCanvas canvas so the user can see what you are referring to.',
      inputSchema: { type: 'object', properties: { id: str('Element id') }, required: ['id'] },
      run: async (args) => {
        requireProject(ctx);
        await ctx.renderer('select', requireString(args, 'id'));
        return [text('Selected.')];
      },
    },
    {
      name: 'insert_jsx',
      title: 'Insert JSX',
      description:
        'Inserts one JSX element (it may contain any number of children). It goes inside "parent_id" when that is an open container (div, section, main, header, footer, nav, article, aside, form, ul, ol, li, figure, label), at the end; otherwise right after it. Plain HTML tags with className/style/data-oc-name attributes are fine; style it afterwards with set_styles.',
      inputSchema: {
        type: 'object',
        properties: { parent_id: str('Target element id'), jsx: str('A single JSX element, e.g. <section data-oc-name="Hero">…</section>') },
        required: ['parent_id', 'jsx'],
      },
      run: (args) => runEdit(ctx, { type: 'insertJsx', parentId: requireString(args, 'parent_id'), jsx: requireString(args, 'jsx') }, 'Insert JSX (agent)', 'Inserted.'),
    },
    {
      name: 'insert_element',
      title: 'Insert preset element',
      description: 'Inserts one of OpenCanvas’s preset blocks (with starter styles) inside or after "parent_id", the same as the Insert menu.',
      inputSchema: {
        type: 'object',
        properties: { parent_id: str('Target element id'), kind: { type: 'string', enum: INSERT_KINDS } },
        required: ['parent_id', 'kind'],
      },
      run: (args) => {
        const kind = requireString(args, 'kind') as InsertKind;
        if (!INSERT_KINDS.includes(kind)) throw new McpToolError(`Unknown kind. Use one of: ${INSERT_KINDS.join(', ')}.`);
        return runEdit(ctx, { type: 'insert', parentId: requireString(args, 'parent_id'), kind }, `Insert ${kind} (agent)`, `Inserted ${kind}.`);
      },
    },
    {
      name: 'set_styles',
      title: 'Set styles',
      description:
        'Sets CSS declarations on one or more elements, e.g. {"padding": "32px", "display": "grid"}. An empty string removes a declaration. "breakpoint" picks base (default), tablet or mobile overrides; "state" picks default or hover. "google_font" (e.g. "Space Grotesk:wght@400;700") also links that Google font from index.html; set font-family alongside it.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: ids('Element ids'),
          styles: { type: 'object', additionalProperties: { type: 'string' }, description: 'CSS property → value (kebab-case properties)' },
          breakpoint: { type: 'string', enum: BREAKPOINTS },
          state: { type: 'string', enum: ['default', 'hover'] },
          google_font: str('Optional Google Fonts family parameter'),
        },
        required: ['ids', 'styles'],
      },
      run: (args) => {
        const [id, ...extraIds] = requireIds(args);
        const styles = args.styles;
        if (!styles || typeof styles !== 'object' || Array.isArray(styles) || !Object.keys(styles).length) throw new McpToolError('"styles" must be an object of CSS declarations.');
        for (const [prop, value] of Object.entries(styles)) {
          if (typeof value !== 'string') throw new McpToolError(`The value for ${prop} must be a string.`);
          if (!/^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/.test(prop)) throw new McpToolError(`"${prop}" is not a CSS property name.`);
          if (/[{};]/.test(value as string)) throw new McpToolError(`The value for ${prop} contains characters that aren't allowed ({ } ;).`);
        }
        const breakpoint: Breakpoint = BREAKPOINTS.includes(args.breakpoint) ? args.breakpoint : 'base';
        const state = args.state === 'hover' ? 'hover' : 'default';
        const command: EditCommand = { type: 'setStyle', id, extraIds, breakpoint, state, styles: styles as Record<string, string> };
        if (typeof args.google_font === 'string' && args.google_font) command.googleFont = args.google_font;
        const props = Object.keys(styles);
        const label = `Set ${props.length === 1 ? props[0] : `${props.length} styles`}${state === 'hover' ? ' (hover)' : ''}${breakpoint !== 'base' ? ` on ${breakpoint}` : ''} (agent)`;
        return runEdit(ctx, command, label, 'Styles updated.');
      },
    },
    {
      name: 'set_text',
      title: 'Set text',
      description: 'Replaces the plain text of an element (headings, paragraphs, buttons, links…). Newlines become <br />.',
      inputSchema: { type: 'object', properties: { id: str('Element id'), text: str('New text') }, required: ['id', 'text'] },
      run: (args) => {
        if (typeof args.text !== 'string') throw new McpToolError('"text" is required.');
        return runEdit(ctx, { type: 'setText', id: requireString(args, 'id'), text: args.text }, 'Edit text (agent)', 'Text updated.');
      },
    },
    {
      name: 'set_attribute',
      title: 'Set attribute',
      description: 'Sets or removes (value null) an attribute: src, alt, href, target, rel, type, placeholder, name, value, title, id or data-oc-name.',
      inputSchema: {
        type: 'object',
        properties: { id: str('Element id'), name: str('Attribute name'), value: { type: ['string', 'null'] } },
        required: ['id', 'name', 'value'],
      },
      run: (args) => {
        const value = args.value === null ? null : typeof args.value === 'string' ? args.value : undefined;
        if (value === undefined) throw new McpToolError('"value" must be a string or null.');
        const name = requireString(args, 'name');
        return runEdit(ctx, { type: 'setAttribute', id: requireString(args, 'id'), name, value: value ?? '' }, `Set ${name} (agent)`, 'Attribute updated.');
      },
    },
    {
      name: 'set_tag',
      title: 'Change element type',
      description: `Changes an element’s tag, keeping its attributes, children and styles (e.g. div → section, h2 → h1). Allowed: ${RETAGGABLE_TAGS.join(', ')}.`,
      inputSchema: { type: 'object', properties: { id: str('Element id'), tag: { type: 'string', enum: RETAGGABLE_TAGS } }, required: ['id', 'tag'] },
      run: (args) => {
        const tag = requireString(args, 'tag');
        return runEdit(ctx, { type: 'setTag', id: requireString(args, 'id'), tag }, `Change to <${tag}> (agent)`, `Changed to <${tag}>.`);
      },
    },
    {
      name: 'rename_element',
      title: 'Rename layer',
      description: 'Sets the layer name shown in OpenCanvas (data-oc-name).',
      inputSchema: { type: 'object', properties: { id: str('Element id'), name: str('Layer name') }, required: ['id', 'name'] },
      run: (args) => {
        const name = requireString(args, 'name').trim();
        return runEdit(ctx, { type: 'rename', id: requireString(args, 'id'), name }, `Rename to ${name} (agent)`, 'Renamed.');
      },
    },
    {
      name: 'remove_elements',
      title: 'Remove elements',
      description: 'Deletes elements (and their children) from the source.',
      inputSchema: { type: 'object', properties: { ids: ids('Element ids') }, required: ['ids'] },
      annotations: { destructiveHint: true },
      run: (args) => {
        const [id, ...extraIds] = requireIds(args);
        return runEdit(ctx, { type: 'remove', id, extraIds }, `Delete ${extraIds.length + 1} element${extraIds.length ? 's' : ''} (agent)`, 'Removed.');
      },
    },
    {
      name: 'duplicate_elements',
      title: 'Duplicate elements',
      description: 'Duplicates elements in place, including their OpenCanvas styles. Handy for cards, list items and nav links.',
      inputSchema: { type: 'object', properties: { ids: ids('Element ids') }, required: ['ids'] },
      run: (args) => {
        const [id, ...extraIds] = requireIds(args);
        return runEdit(ctx, { type: 'duplicate', id, extraIds }, 'Duplicate (agent)', 'Duplicated.');
      },
    },
    {
      name: 'move_element',
      title: 'Move element',
      description: 'Moves an element one step up or down among its siblings.',
      inputSchema: { type: 'object', properties: { id: str('Element id'), direction: { type: 'string', enum: ['up', 'down'] } }, required: ['id', 'direction'] },
      run: (args) => {
        const direction = args.direction === 'up' ? 'up' : 'down';
        return runEdit(ctx, { type: 'move', id: requireString(args, 'id'), direction }, `Move ${direction} (agent)`, `Moved ${direction}.`);
      },
    },
    {
      name: 'group_elements',
      title: 'Group elements',
      description: 'Wraps adjacent sibling elements in a new <div> ("Group"), which is returned so you can style it.',
      inputSchema: { type: 'object', properties: { ids: ids('Adjacent sibling element ids') }, required: ['ids'] },
      run: (args) => {
        const [id, ...extraIds] = requireIds(args);
        return runEdit(ctx, { type: 'group', id, extraIds }, 'Group (agent)', 'Grouped.');
      },
    },
    {
      name: 'ungroup_element',
      title: 'Ungroup element',
      description: 'Removes a wrapper element, keeping its children in place.',
      inputSchema: { type: 'object', properties: { id: str('Wrapper element id') }, required: ['id'] },
      run: (args) => runEdit(ctx, { type: 'ungroup', id: requireString(args, 'id') }, 'Ungroup (agent)', 'Ungrouped.'),
    },
    {
      name: 'import_files',
      title: 'Import files',
      description: 'Copies files from this computer (absolute paths), such as images or SVGs, into the project. Reference them in JSX by the returned public URL.',
      inputSchema: {
        type: 'object',
        properties: { paths: { type: 'array', items: { type: 'string' }, minItems: 1 }, dir: str('Project folder to copy into (default "public")') },
        required: ['paths'],
      },
      run: (args) => {
        requireProject(ctx);
        const sources = requireIds(args, 'paths');
        const dir = typeof args.dir === 'string' && args.dir ? args.dir : 'public';
        const result = ctx.importFiles(sources, dir);
        const lines = result.files.map((rel) => `${rel}${rel.startsWith('public/') ? `  → use src="${rel.slice('public'.length)}"` : ''}`);
        return [text(lines.join('\n') || 'Nothing was imported.')];
      },
    },
    {
      name: 'screenshot',
      title: 'Screenshot the page',
      description: 'Renders the live preview at a viewport width and returns an image. Full page by default (capped at 8000px tall).',
      inputSchema: {
        type: 'object',
        properties: {
          width: { type: 'integer', minimum: 320, maximum: 2560, description: 'Viewport width in px (default 1440)' },
          full_page: { type: 'boolean', description: 'Capture the whole page instead of the first screen (default true)' },
          page: str('URL path of the page to capture, e.g. "/about" (default "/"). See list_pages.'),
        },
      },
      annotations: { readOnlyHint: true },
      run: async (args) => {
        requireProject(ctx);
        const width = Number.isInteger(args.width) ? Math.min(2560, Math.max(320, args.width)) : 1440;
        const page = typeof args.page === 'string' && args.page.trim() ? normalizePath(args.page) : '/';
        const image = await ctx.screenshot(width, args.full_page !== false, page);
        return [{ type: 'image', data: image.toString('base64'), mimeType: 'image/jpeg' }];
      },
    },
    {
      name: 'git_status',
      title: 'Git status',
      description: 'Shows the project’s git state: branch, connected remote, unpushed commits, changed files and the last commit.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: async () => {
        requireProject(ctx);
        return [text(describeGit(await ctx.git.status()))];
      },
    },
    {
      name: 'git_commit',
      title: 'Commit changes',
      description: 'Commits every change in the project folder. Creates the git repository (branch main, with a .gitignore) on first use.',
      inputSchema: { type: 'object', properties: { message: str('Commit message') }, required: ['message'] },
      run: async (args) => {
        requireProject(ctx);
        const message = requireString(args, 'message');
        await ensureRepo(ctx);
        await ctx.git.commit(message);
        return [text(describeGit(await ctx.git.status()))];
      },
    },
    {
      name: 'git_publish',
      title: 'Publish to GitHub',
      description:
        'Publishes the project to GitHub: creates the repository if needed, commits outstanding changes, connects a remote and pushes. With no remote connected it creates a new repository on the user’s GitHub account (GitHub sign-in may open a window for the user), or connects "remote" (a URL or owner/repo) when given.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: str('Name for a new GitHub repository (default: the project name)'),
          private: { type: 'boolean', description: 'Make a new repository private (default true)' },
          remote: str('Existing repository to connect instead of creating one: URL or owner/repo'),
          message: str('Commit message for outstanding changes (default "Publish from OpenCanvas")'),
        },
      },
      run: async (args) => [text(await publishToGithub(ctx, args))],
    },
    {
      name: 'go_live',
      title: 'Go live',
      description:
        'Puts the site on the web in three steps: saves (commits) outstanding changes, pushes to GitHub (creating the repository if needed, same options as git_publish), then publishes on Vercel. If the user has no Vercel set up, it returns a vercel.com link to send them to; after they import the repository there, call go_live again to get the live URL.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: str('Name for a new GitHub repository (default: the project name)'),
          private: { type: 'boolean', description: 'Make a new repository private (default true)' },
          message: str('Commit message for outstanding changes (default "Publish from OpenCanvas")'),
        },
      },
      run: async (args) => {
        const github = await publishToGithub(ctx, args);
        const result = await ctx.git.goLive();
        const vercel =
          result.status === 'live'
            ? `Live on Vercel${result.url ? `: ${result.url}` : '.'}`
            : `Not live yet: Vercel isn’t set up for this repository${result.reason === 'signed-out' ? ' (the Vercel CLI is installed but signed out)' : ''}. Ask the user whether they would like to go to Vercel so the site can become live, and share this link: ${result.importUrl}`;
        return [text(`${vercel}\n\n${github}`)];
      },
    },
    {
      name: 'undo',
      title: 'Undo',
      description: 'Undoes the most recent change in OpenCanvas’s history (yours or the user’s).',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        requireProject(ctx);
        return [text(String(await ctx.renderer('undo')))];
      },
    },
    {
      name: 'redo',
      title: 'Redo',
      description: 'Redoes the most recently undone change.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        requireProject(ctx);
        return [text(String(await ctx.renderer('redo')))];
      },
    },
    {
      name: 'propose_variant',
      title: 'Propose variant',
      description:
        'Stores one alternative JSX element for the selected source element as a temporary variant. Does not change project files until the user applies it. Call once per alternative.',
      inputSchema: {
        type: 'object',
        properties: {
          label: str('Short name for this alternative'),
          notes: str('Optional one-line note about what differs'),
          jsx: str('A single JSX element that replaces the selected element'),
          element_id: str('Element id when proposing outside an in-app generation turn'),
          set_id: str('Optional generation set id'),
        },
        required: ['label', 'jsx'],
      },
      annotations: { readOnlyHint: true },
      run: (args) => {
        requireProject(ctx);
        if (!ctx.variants) throw new McpToolError('Variants are not available.');
        const record = ctx.variants.propose({
          label: requireString(args, 'label'),
          notes: typeof args.notes === 'string' ? args.notes : '',
          jsx: requireString(args, 'jsx'),
          elementId: typeof args.element_id === 'string' ? args.element_id : undefined,
          setId: typeof args.set_id === 'string' ? args.set_id : undefined,
        });
        return [text(`Variant ready: ${record.label} (${record.id})\nStatus: ${record.status}`)];
      },
    },
    {
      name: 'list_variants',
      title: 'List variants',
      description: 'Lists temporary variant proposals for the open project (ready, generating, failed, or stale).',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => {
        requireProject(ctx);
        if (!ctx.variants) throw new McpToolError('Variants are not available.');
        return [text(JSON.stringify(ctx.variants.list(), null, 2))];
      },
    },
    {
      name: 'apply_variant',
      title: 'Apply variant',
      description: 'Writes a ready variant into the real source file as one undoable edit. Fails with a stale error when the file changed since generation.',
      inputSchema: {
        type: 'object',
        properties: { id: str('Variant id from list_variants or propose_variant') },
        required: ['id'],
      },
      run: (args) => {
        requireProject(ctx);
        if (!ctx.variants) throw new McpToolError('Variants are not available.');
        const result = ctx.variants.apply(requireString(args, 'id'));
        if (!result.ok) throw new McpToolError(result.error || 'Could not apply the variant.');
        return [text(`Applied variant.${result.selectId ? `\nElement id: ${result.selectId}` : ''}`)];
      },
    },
  ];
}
