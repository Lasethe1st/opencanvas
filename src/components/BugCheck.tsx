import { Bug, ChevronRight, CircleCheck, CircleX, Crosshair, Info, RotateCw, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { AuditCategory, AuditIssue, AuditSeverity } from '../../shared/types';
import { api } from '../lib/api';
import { CATEGORY_LABELS, fixPrompt, runAudit, showIssue } from '../lib/audit';
import { noun, plural } from '../lib/plural';
import { getState, setState, toast, useStore } from '../lib/store';
import { Panel, PanelTitle } from '../ui/Panels.jsx';
import { Button, IconButton, Spinner } from '../ui/primitives.jsx';
import { ToolButton } from '../ui/ToolRail.jsx';
import { Resizer } from './Resizer';

const SEVERITY_ICON: Record<AuditSeverity, ReactNode> = {
  error: <CircleX size={14} />,
  warning: <TriangleAlert size={14} />,
  info: <Info size={14} />,
};

function startAudit() {
  void runAudit().catch((err) => toast(err instanceof Error ? err.message : String(err), 'error'));
}

export function BugCheckButton() {
  const open = useStore((s) => s.auditOpen);
  const errors = useStore((s) => s.audit?.issues.filter((i) => i.severity === 'error').length ?? 0);
  return (
    <ToolButton
      label="Check for bugs"
      shortcut={errors ? plural(errors, 'error', 'errors') : undefined}
      active={open}
      aria-expanded={open}
      onClick={() => {
        setState({ auditOpen: !open });
        if (!open && !getState().audit && !getState().auditRunning) startAudit();
      }}
    >
      <Bug size={16} />
      {errors > 0 && <span className="bug-check-trigger__dot" aria-hidden />}
    </ToolButton>
  );
}

function ago(at: number, now: number) {
  const s = Math.round((now - at) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function IssueRow({ issue, frameCount }: { issue: AuditIssue; frameCount: number }) {
  const [open, setOpen] = useState(false);
  const sizes = issue.frames.length && issue.frames.length < frameCount ? `only on ${issue.frames.join(', ')}` : null;
  const where = [issue.name, sizes].filter(Boolean).join(' · ');
  return (
    <li className={`audit-issue audit-issue--${issue.severity}${open ? ' is-open' : ''}`}>
      <button type="button" className="audit-issue__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="audit-issue__icon">{SEVERITY_ICON[issue.severity]}</span>
        <span className="audit-issue__text">
          <span className="audit-issue__title">{issue.title}</span>
          {where && <span className="audit-issue__where">{where}</span>}
        </span>
        <ChevronRight size={13} className="audit-issue__chev" />
      </button>
      {open && (
        <div className="audit-issue__body">
          {issue.detail && <p className={issue.category === 'errors' || issue.category === 'project' ? 'audit-issue__detail is-code' : 'audit-issue__detail'}>{issue.detail}</p>}
          <div className="audit-issue__fix">
            <span>Suggested fix</span>
            <p>{issue.fix}</p>
          </div>
          {issue.id && (
            <Button size="sm" icon={<Crosshair size={13} />} onClick={() => showIssue(issue)}>
              Show on canvas
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

async function fixWithAi() {
  const report = getState().audit;
  if (!report) return;
  try {
    if (!getState().mcp?.running) setState({ mcp: await api.mcp.setEnabled(true) });
    await navigator.clipboard.writeText(fixPrompt(report));
    toast('Prompt copied. Paste it into Cursor or Claude and it will fix the problems through OpenCanvas.', 'success');
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error');
  }
}

export function BugCheckPanel() {
  const open = useStore((s) => s.auditOpen);
  const report = useStore((s) => s.audit);
  const running = useStore((s) => s.auditRunning);
  const width = useStore((s) => s.rightWidth);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.dialog-backdrop, .settings-page') && setState({ auditOpen: false });
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;

  const counts = { error: 0, warning: 0, info: 0 };
  const groups = new Map<AuditCategory, AuditIssue[]>();
  for (const issue of report?.issues ?? []) {
    counts[issue.severity]++;
    groups.set(issue.category, [...(groups.get(issue.category) ?? []), issue]);
  }
  const tested = report?.frames.map((f) => f.name).join(', ');

  return (
    <Panel
      side="right"
      width={width}
      className="panel panel--right audit-panel"
      aria-label="Bug check"
      head={
        <>
          <PanelTitle>Bug check</PanelTitle>
          <IconButton label="Run again" size="sm" disabled={running} onClick={startAudit}>
            <RotateCw size={13} />
          </IconButton>
          <IconButton label="Close" size="sm" onClick={() => setState({ auditOpen: false })}>
            <X size={14} />
          </IconButton>
        </>
      }
      resizer={<Resizer value={width} min={260} max={440} invert onChange={(v) => setState({ rightWidth: v })} />}
    >
      <div className="audit-panel__body" aria-busy={running}>
        <span className="sr-only" role="status">
          {running ? 'Checking for bugs' : report ? (report.issues.length ? `Found ${plural(report.issues.length, 'problem', 'problems')}` : 'No problems found') : ''}
        </span>
        <p className="audit-panel__meta">{running ? 'Testing your site…' : report ? `${tested ? `Tested on ${tested}` : 'Checked'} · ${ago(report.at, now)}` : 'Tests every screen size for problems'}</p>
        {running && !report ? (
          <div className="audit-panel__state">
            <Spinner />
            <p>Loading the site on desktop, tablet and mobile and checking for errors, broken links, layout, accessibility and SEO problems…</p>
          </div>
        ) : report && !report.issues.length ? (
          <div className="audit-panel__state is-clean">
            <CircleCheck size={28} />
            <strong>No problems found</strong>
            <p>{tested ? `Tested on ${tested}.` : 'Everything checked out.'}</p>
          </div>
        ) : report ? (
          <>
            <div className="audit-summary">
              <span className="audit-summary__item audit-summary__item--error">
                <b>{counts.error}</b> {noun(counts.error, 'error', 'errors')}
              </span>
              <span className="audit-summary__item audit-summary__item--warning">
                <b>{counts.warning}</b> {noun(counts.warning, 'warning', 'warnings')}
              </span>
              <span className="audit-summary__item audit-summary__item--info">
                <b>{counts.info}</b> {noun(counts.info, 'suggestion', 'suggestions')}
              </span>
            </div>
            {[...groups].map(([category, issues]) => (
              <section key={category} className="audit-group">
                <h3>
                  {CATEGORY_LABELS[category]} <span>{issues.length}</span>
                </h3>
                <ul>
                  {issues.map((issue) => (
                    <IssueRow key={issue.key} issue={issue} frameCount={report.frames.length} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : null}
      </div>

      {report && report.issues.length > 0 && (
        <footer className="audit-panel__foot">
          <Button variant="primary" icon={<Sparkles size={14} />} onClick={() => void fixWithAi()}>
            Fix with AI
          </Button>
          <p>Copies a prompt for Cursor or Claude. They read this report and fix your code through the OpenCanvas MCP server.</p>
        </footer>
      )}
    </Panel>
  );
}
