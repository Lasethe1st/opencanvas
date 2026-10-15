/** Bug check: asks every preview frame's bridge to inspect its page, then adds project-level problems. */
import type { AuditCategory, AuditIssue, AuditReport, AuditSeverity } from '../../shared/types';
import { frameIds, sendToFrame, sendToPreview } from './bridge';
import { plural } from './plural';
import { getState, setState } from './store';

interface FrameIssue {
  rule: string;
  severity: AuditSeverity;
  category: AuditCategory;
  title: string;
  detail?: string;
  fix: string;
  id: string | null;
  name: string | null;
}

interface FrameReport {
  width: number;
  issues: FrameIssue[];
  error?: string;
}

const FRAME_TIMEOUT = 4000;
/** Page-wide checks that would otherwise repeat once per frame. */
const PAGE_RULES = new Set(['no-title', 'no-description', 'no-viewport', 'no-lang', 'no-favicon', 'no-h1', 'many-h1', 'build-error', 'runtime-error', 'console-error', 'failed-resource', 'failed-request']);

let requestSeq = 0;

function askFrame(frameId: string): Promise<FrameReport | null> {
  const requestId = `audit-${++requestSeq}`;
  return new Promise((resolve) => {
    const done = (value: FrameReport | null) => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.source === 'oc-bridge' && msg.type === 'audit' && msg.requestId === requestId) done(msg.payload as FrameReport);
    };
    const timer = setTimeout(() => done(null), FRAME_TIMEOUT);
    window.addEventListener('message', onMessage);
    sendToFrame(frameId, 'audit', { requestId });
  });
}

function projectIssues(): Omit<AuditIssue, 'key' | 'frames'>[] {
  const { project, previewStatus } = getState();
  const issues: Omit<AuditIssue, 'key' | 'frames'>[] = [];
  const base = { id: null, name: null };
  if (previewStatus.state === 'error') {
    issues.push({ ...base, rule: 'preview-error', severity: 'error', category: 'project', title: 'The preview server failed to start', detail: previewStatus.error, fix: 'Read the error: it usually names a missing package or a broken config file. Fix it, then restart the preview.' });
  }
  if (previewStatus.state !== 'stopped') {
    const lines = previewStatus.log.split('\n').filter((l) => /\b(error|failed to resolve|does the file exist)\b/i.test(l)).map((l) => l.trim());
    for (const line of [...new Set(lines)].slice(-3)) {
      issues.push({ ...base, rule: 'build-log', severity: 'error', category: 'project', title: 'Error from the build server', detail: line.slice(0, 500), fix: 'Usually a bad import path or a syntax error. Open the file it names and fix that line.' });
    }
  }
  if (project?.missingDependencies.length) {
    issues.push({ ...base, rule: 'missing-deps', severity: 'error', category: 'project', title: `${project.missingDependencies.length} package${project.missingDependencies.length === 1 ? ' isn’t' : 's aren’t'} installed`, detail: project.missingDependencies.join(', '), fix: `Run ${project.packageManager} install in the project folder, then restart the preview.` });
  }
  for (const warning of project?.warnings ?? []) {
    issues.push({ ...base, rule: 'project-warning', severity: 'warning', category: 'project', title: 'Project warning', detail: warning, fix: 'Follow the note above; OpenCanvas may not be able to edit or preview parts of the project until it’s resolved.' });
  }
  return issues;
}

const SEVERITY_ORDER: Record<AuditSeverity, number> = { error: 0, warning: 1, info: 2 };

export async function runAudit(): Promise<AuditReport> {
  setState({ auditRunning: true });
  try {
    const { frames, frameRuntime } = getState();
    const ids = frameIds().filter((id) => frameRuntime[id]?.ready);
    const reports = await Promise.all(ids.map(async (id) => ({ frame: frames.find((f) => f.id === id), report: await askFrame(id) })));
    const merged = new Map<string, AuditIssue>();
    const answered: { name: string; width: number }[] = [];
    for (const { frame, report } of reports) {
      if (!report) continue;
      const frameName = frame?.name ?? `${report.width}px`;
      answered.push({ name: frameName, width: report.width });
      for (const issue of report.issues) {
        const key = `${issue.rule}|${issue.id ?? ''}|${PAGE_RULES.has(issue.rule) || issue.id ? '' : issue.detail ?? ''}${issue.rule === 'overflow' && !issue.id ? frameName : ''}`;
        const existing = merged.get(key);
        if (existing) {
          if (!existing.frames.includes(frameName)) existing.frames.push(frameName);
        } else {
          merged.set(key, { ...issue, key, frames: [frameName] });
        }
      }
    }
    const issues = [...merged.values(), ...projectIssues().map((i) => ({ ...i, key: `${i.rule}|${i.detail ?? ''}`, frames: [] }))];
    if (!answered.length && !issues.some((i) => i.category === 'project')) {
      issues.push({ key: 'no-preview', rule: 'no-preview', severity: 'error', category: 'project', title: 'The preview isn’t running', fix: 'Start the preview (or wait for it to finish loading), then run the check again so the site can be tested.', id: null, name: null, frames: [] });
    }
    issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    const report: AuditReport = { at: Date.now(), frames: answered, issues };
    setState({ audit: report });
    return report;
  } finally {
    setState({ auditRunning: false });
  }
}

/** Selects the element an issue points at, in the frame where it was found. */
export function showIssue(issue: AuditIssue) {
  if (!issue.id) return;
  const frame = getState().frames.find((f) => issue.frames.includes(f.name));
  setState({ mode: 'visual', pendingSelectId: issue.id, multiSelect: [], ...(frame ? { activeFrameId: frame.id } : {}) });
  sendToPreview('sync');
}

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  errors: 'Errors',
  links: 'Links & files',
  layout: 'Layout',
  a11y: 'Accessibility',
  seo: 'Search & sharing',
  project: 'Project',
};

export function describeIssue(issue: AuditIssue): string {
  const where = [issue.name && issue.id ? `${issue.name} (${issue.id})` : null, issue.frames.length ? `on ${issue.frames.join(', ')}` : null].filter(Boolean).join(' ');
  return [`[${issue.severity}] ${issue.title}${where ? ` — ${where}` : ''}`, issue.detail ? `  ${issue.detail.replace(/\n/g, '\n  ')}` : null, `  Suggested fix: ${issue.fix}`].filter(Boolean).join('\n');
}

export function fixPrompt(report: AuditReport): string {
  const list = report.issues.map(describeIssue).join('\n\n');
  return `OpenCanvas ran a bug check on my site and found ${plural(report.issues.length, 'problem', 'problems')}. Fix them.

Use the OpenCanvas MCP server: call run_audit to get the latest report, fix each issue in the source (use set_styles for styling changes so I can keep editing visually), check with screenshot at desktop, tablet and mobile widths, then call run_audit again to confirm the problems are gone. Skip anything that is intentional, and tell me what you changed.

${list}`;
}
