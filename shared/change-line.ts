/**
 * Chat lines for file and canvas changes.
 * One row per file: present participle while it runs, past tense when it finishes.
 * Basename only — never a project path or a raw tool name.
 */

export type ChangeKind = 'edit' | 'debug' | 'restyle';

export interface LineDiff {
  added: number;
  removed: number;
  /** Project-relative path of the file that changed the most, when we know it. */
  path?: string;
}

const EDIT_TOOLS = new Set([
  'write_file',
  'insert_jsx',
  'insert_element',
  'set_text',
  'set_attribute',
  'set_tag',
  'rename_element',
  'remove_elements',
  'duplicate_elements',
  'move_element',
  'group_elements',
  'ungroup_element',
  'apply_variant',
]);
const RESTYLE_TOOLS = new Set(['set_styles']);
const DEBUG_TOOLS = new Set(['run_audit']);

const PRESENT: Record<ChangeKind, string> = { edit: 'Editing', debug: 'Debugging', restyle: 'Restyling' };
const PAST: Record<ChangeKind, string> = { edit: 'Edited', debug: 'Debugged', restyle: 'Restyled' };

const DIFF_MARK = /\n@@oc-diff (\{[\s\S]*?\})@@$/;
const TOOL_NAME = /\b[a-z]+(?:_[a-z0-9]+)+\b/g;
const PATH_RE = /(?:[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+\.[A-Za-z0-9]+|(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+)/g;

export function baseName(file: string): string {
  const name = file.replace(/\\/g, '/').split('/').pop() || file;
  return name || file;
}

/** Element ids look like `src/App.tsx:12:6`. */
export function fileFromElementId(id: string | null | undefined): string | null {
  if (!id) return null;
  const match = /^(.*\.[A-Za-z0-9]+):\d+:\d+$/.exec(id);
  return match ? match[1] : null;
}

export function pathFromArgs(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  if (typeof args.path === 'string' && args.path.trim()) return args.path.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
  const id =
    (typeof args.id === 'string' && args.id) ||
    (typeof args.parent_id === 'string' && args.parent_id) ||
    (Array.isArray(args.ids) && typeof args.ids[0] === 'string' ? args.ids[0] : '');
  return fileFromElementId(id) ;
}

export function changeKind(tool: string, args?: Record<string, unknown>, summary?: string): ChangeKind | null {
  if (RESTYLE_TOOLS.has(tool)) return 'restyle';
  if (tool === 'propose_token_change') {
    if (args) return args.apply === true ? 'restyle' : null;
    return /^restyl/i.test(summary ?? '') ? 'restyle' : null;
  }
  if (DEBUG_TOOLS.has(tool)) return 'debug';
  if (EDIT_TOOLS.has(tool)) return 'edit';
  return null;
}

export function changeTarget(kind: ChangeKind, args?: Record<string, unknown>): { label: string; path: string | null } {
  const path = pathFromArgs(args);
  if (kind === 'restyle') {
    if (path && /\.css$/i.test(path)) return { label: baseName(path), path };
    return { label: 'CSS', path: null };
  }
  if (path) return { label: baseName(path), path };
  return { label: 'file', path: null };
}

/** Present or past line for a file/canvas tool, or null when this tool is not one of those. */
export function describeChange(
  tool: string,
  args: Record<string, unknown> | undefined,
  done: boolean,
): { title: string; label: string; path: string | null; kind: ChangeKind } | null {
  const kind = changeKind(tool, args);
  if (!kind) return null;
  const target = changeTarget(kind, args);
  return { title: `${done ? PAST[kind] : PRESENT[kind]} ${target.label}`, label: target.label, path: target.path, kind };
}

function labelFrom(item: { tool: string; summary: string; file?: string | null; elementId?: string | null }): string {
  const kind = changeKind(item.tool, undefined, item.summary);
  if (item.file && item.file.trim()) return baseName(item.file.trim());
  if (kind && kind !== 'restyle') {
    const fromId = fileFromElementId(item.elementId);
    if (fromId) return baseName(fromId);
    const tail = /(?:^|\s)([\w.-]+\.[A-Za-z0-9]+)\s*$/.exec(item.summary);
    if (tail) return tail[1];
  }
  if (kind === 'restyle') return 'CSS';
  return 'file';
}

/** Title for a stored tool row. `failed` keeps the existing failure line, with paths and tool names stripped. */
export function changePresentation(item: {
  tool: string;
  summary: string;
  state: 'running' | 'done' | 'failed';
  file?: string | null;
  elementId?: string | null;
}): { title: string; failed: string; kind: ChangeKind } | null {
  const kind = changeKind(item.tool, undefined, item.summary);
  if (!kind) return null;
  const label = labelFrom(item);
  const title = `${item.state === 'running' ? PRESENT[kind] : PAST[kind]} ${label}`;
  return { title, failed: failedToolTitle(item.tool, item.summary), kind };
}

/** Line for the running-work popover. Web tools keep the thread's Browsing copy. */
export function runningLineFor(tool: string, summary: string, file?: string | null): string | null {
  const change = changePresentation({ tool, summary, state: 'running', file });
  if (change) return change.title;
  if (tool === 'web_search' || tool === 'fetch_url') return 'Browsing…';
  return null;
}

export function failedToolTitle(tool: string, summary: string): string {
  const leaked = PATH_RE.test(summary) || summary.includes(tool) || TOOL_NAME.test(summary);
  PATH_RE.lastIndex = 0;
  TOOL_NAME.lastIndex = 0;
  if (!leaked) return summary.startsWith('Failed') ? summary : `Failed: ${summary}`;
  let text = summary.replace(PATH_RE, (match) => baseName(match));
  const named = new RegExp(tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  text = text.replace(named, '').replace(TOOL_NAME, '');
  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([:,.])/g, '$1').trim();
  if (!text) return 'Failed';
  return text.startsWith('Failed') ? text : `Failed: ${text}`;
}

function splitLines(text: string | null): string[] {
  if (text == null || text === '') return [];
  const parts = text.split('\n');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function lineCounts(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

/** Added and removed lines. Same text in a different order does not count. */
export function lineDelta(before: string | null, after: string | null): { added: number; removed: number } {
  const beforeCounts = lineCounts(splitLines(before));
  const afterCounts = lineCounts(splitLines(after));
  let added = 0;
  let removed = 0;
  for (const [line, count] of beforeCounts) {
    const drop = count - (afterCounts.get(line) ?? 0);
    if (drop > 0) removed += drop;
  }
  for (const [line, count] of afterCounts) {
    const extra = count - (beforeCounts.get(line) ?? 0);
    if (extra > 0) added += extra;
  }
  return { added, removed };
}

export function diffOfChanges(changes: { path: string; before: string | null; after: string | null }[]): LineDiff | null {
  let added = 0;
  let removed = 0;
  let best = -1;
  let path: string | undefined;
  let saw = false;
  for (const change of changes) {
    const delta = lineDelta(change.before, change.after);
    if (!change.before && !change.after) continue;
    saw = true;
    added += delta.added;
    removed += delta.removed;
    const score = delta.added + delta.removed;
    if (score > best) {
      best = score;
      path = change.path;
    }
  }
  if (!saw) return null;
  return { added, removed, ...(path ? { path } : {}) };
}

/** Hide the marker when both sides are zero — the row then shows no counts. */
export function withDiff(text: string, diff: LineDiff): string {
  if (!diff.added && !diff.removed) return text;
  const payload = JSON.stringify({ added: diff.added, removed: diff.removed, ...(diff.path ? { path: diff.path } : {}) });
  return `${text}\n@@oc-diff ${payload}@@`;
}

export function takeDiff(text: string): { text: string; diff: LineDiff | null } {
  const match = DIFF_MARK.exec(text);
  if (!match) return { text, diff: null };
  const body = text.slice(0, match.index).trimEnd();
  try {
    const raw = JSON.parse(match[1]) as { added?: unknown; removed?: unknown; path?: unknown };
    const added = Number(raw.added);
    const removed = Number(raw.removed);
    if (!Number.isFinite(added) || !Number.isFinite(removed)) return { text: body, diff: null };
    return { text: body, diff: { added, removed, ...(typeof raw.path === 'string' ? { path: raw.path } : {}) } };
  } catch {
    return { text: body, diff: null };
  }
}

export function stripDiffMarker<T extends { type: string; text?: string }>(content: T[]): T[] {
  return content.map((part) => {
    if (part.type !== 'text' || typeof part.text !== 'string') return part;
    const taken = takeDiff(part.text);
    return taken.diff ? { ...part, text: taken.text } : part;
  });
}

export function splitDiff<T extends { type: string; text?: string }>(content: T[]): { content: T[]; diff: LineDiff | null } {
  let diff: LineDiff | null = null;
  const next = content.map((part) => {
    if (part.type !== 'text' || typeof part.text !== 'string') return part;
    const taken = takeDiff(part.text);
    if (taken.diff) diff = taken.diff;
    return taken.diff ? { ...part, text: taken.text } : part;
  });
  return { content: next, diff };
}
