import { useEffect, useRef, useState } from 'react';
import { FRAMEWORK_LABELS, type BuildCheckResult, type ExportIssue, type ExportReport, type ExportResult } from '../../shared/types';
import { errorMessage, revealInCode } from '../lib/actions';
import { api } from '../lib/api';
import { plural } from '../lib/plural';
import { hasUnsaved, setState, toast, useStore } from '../lib/store';
import { Archive, CheckmarkFilled, ErrorFilled, FolderOpen, Icon, Information, Tools, WarningAlt } from '@/components/lime/icon';
import { Button, Spinner } from '@/components/lime/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lime/ui/dialog';
import { List, ListIcon, ListItem } from '@/components/lime/ui/list';

const SEVERITY_ICON = {
  error: ErrorFilled,
  warning: WarningAlt,
  info: Information,
} as const;

const MAX_LOG = 60_000;

function openIssueFile(file: string) {
  const m = /^(.*?):(\d+)$/.exec(file);
  if (m) revealInCode(m[1], Number(m[2]));
  else revealInCode(file, 1);
}

function IssueRow({ issue }: { issue: ExportIssue }) {
  return (
    <ListItem
      leading={<ListIcon icon={SEVERITY_ICON[issue.severity]} tone={issue.severity === 'error' ? 'danger' : 'neutral'} />}
      title={issue.title}
      description={issue.file ? `${issue.file} · ${issue.fix}` : issue.fix}
      onClick={issue.file ? () => openIssueFile(issue.file!) : undefined}
      chevron={!!issue.file}
    />
  );
}

function reportSummary(report: ExportReport) {
  const errors = report.issues.filter((i) => i.severity === 'error').length;
  const warnings = report.issues.filter((i) => i.severity === 'warning').length;
  const files = plural(report.checkedFiles, 'file', 'files');
  if (!errors && !warnings) return `Checked ${files}. Nothing stands in the way of running it elsewhere.`;
  const parts = [errors && plural(errors, 'problem', 'problems'), warnings && plural(warnings, 'warning', 'warnings')].filter(Boolean);
  return `Checked ${files}: ${parts.join(' and ')}. ${errors ? 'The export will likely fail to run until these are fixed.' : 'It should still run.'}`;
}

const CHECK_TEXT: Record<BuildCheckResult['state'], string> = {
  passed: 'It builds',
  failed: 'The build failed',
  unavailable: 'Could not check the build',
  cancelled: 'Build check cancelled',
};

export function ExportDialog() {
  const open = useStore((s) => s.exportOpen);
  const project = useStore((s) => s.project);
  const dirty = useStore((s) => hasUnsaved(s));
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [report, setReport] = useState<ExportReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<BuildCheckResult | null>(null);
  const [log, setLog] = useState('');
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!open || !project) return;
    let alive = true;
    setReport(null);
    api.validateExport().then(
      (r) => alive && setReport(r),
      (err) => alive && toast(`Could not check the export: ${errorMessage(err)}`, 'error'),
    );
    return () => {
      alive = false;
    };
  }, [open, project]);

  useEffect(() => {
    if (!checking) return;
    return api.onCheckLog((text) => setLog((prev) => (prev + text).slice(-MAX_LOG)));
  }, [checking]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const close = () => {
    if (checking) void api.cancelBuildCheck();
    setState({ exportOpen: false });
    setResult(null);
    setCheck(null);
    setLog('');
  };

  const exportZip = async () => {
    setWorking(true);
    try {
      const res = await api.exportZip();
      if (res.ok) setResult(res);
    } catch (err) {
      toast(`Could not export: ${errorMessage(err)}`, 'error');
    } finally {
      setWorking(false);
    }
  };

  const checkBuild = async () => {
    setLog('');
    setCheck(null);
    setChecking(true);
    try {
      setCheck(await api.checkBuild());
    } catch (err) {
      setCheck({ state: 'failed', message: errorMessage(err), steps: [] });
    } finally {
      setChecking(false);
    }
  };

  const frameworkLabel = project?.framework === 'unknown' ? '' : project ? `${FRAMEWORK_LABELS[project.framework]} ` : '';

  return (
    <Dialog
      open={open && !!project}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Export project</DialogTitle>
          <DialogDescription>Download a clean copy of your project to run anywhere.</DialogDescription>
        </DialogHeader>

        {dirty && (
          <p className="rounded-panel bg-warn-tint px-3 py-2 text-sm text-warn-text" role="status">
            The code editor has unsaved changes. They will not be included until you save.
          </p>
        )}

        {!result ? (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3" aria-label="Export check">
              {!report ? (
                <span className="inline-flex items-center gap-2 text-sm text-fg-2">
                  <Spinner /> Checking what the export will contain…
                </span>
              ) : (
                <>
                  <p className="text-sm text-fg-2">{reportSummary(report)}</p>
                  {report.issues.length > 0 && (
                    <List variant="plain" aria-label="Issues found">
                      {report.issues.map((issue, i) => (
                        <IssueRow key={i} issue={issue} />
                      ))}
                    </List>
                  )}
                </>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {checking ? (
                  <Button size="sm" variant="secondary" onClick={() => void api.cancelBuildCheck()}>
                    Cancel check
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" icon={<Icon icon={Tools} size={16} />} onClick={() => void checkBuild()}>
                    Check it builds
                  </Button>
                )}
                <span className="text-sm text-fg-2">
                  {checking ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Installing and building a clean copy…
                    </span>
                  ) : (
                    'Installs and builds a clean copy in a temporary folder. Takes a minute or two.'
                  )}
                </span>
              </div>
              {check && (
                <p
                  className={
                    check.state === 'passed'
                      ? 'rounded-panel bg-success-tint px-3 py-2 text-sm text-success-text'
                      : 'rounded-panel bg-warn-tint px-3 py-2 text-sm text-warn-text'
                  }
                  role="status"
                >
                  <strong>{CHECK_TEXT[check.state]}.</strong> {check.message}
                </p>
              )}
              {(checking || log) && (
                <pre className="max-h-40 overflow-auto rounded-panel bg-surface p-3 font-mono text-xs text-fg" ref={logRef} aria-label="Build check log">
                  {log || 'Starting…'}
                </pre>
              )}
            </section>

            <DialogFooter className="sm:flex-col sm:items-stretch">
              <Button icon={<Icon icon={Archive} size={16} />} pending={working || undefined} disabled={working} onClick={() => void exportZip()}>
                Download project ZIP
              </Button>
              <Button variant="secondary" icon={<Icon icon={FolderOpen} size={16} />} onClick={() => void api.revealProject()}>
                Open project folder
              </Button>
              <p className="text-sm text-fg-2">Source, config and assets. Excludes node_modules, build output and local env files. The project already lives on disk as a normal {frameworkLabel}project.</p>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="rounded-panel bg-success-tint px-3 py-2 text-sm text-success-text" role="status">
              <Icon icon={CheckmarkFilled} size={16} className="me-1 inline align-text-bottom" />
              Exported {result.fileCount} files to{' '}
              <Button variant="link" size="sm" onClick={() => result.path && void api.revealFile(result.path)}>
                {result.path}
              </Button>
            </p>
            <p className="text-sm text-fg">Unzip it anywhere and run:</p>
            <pre className="overflow-auto rounded-panel bg-surface p-3 font-mono text-sm text-fg">{result.instructions?.join('\n')}</pre>
            {result.envExampleAdded && (
              <p className="text-sm text-fg-2">The ZIP includes a .env.example with the variable names your code reads. It has no values; fill them in after copying it to .env.</p>
            )}
            <p className="text-sm text-fg-2">The exported project has no dependency on OpenCanvas.</p>
            <DialogFooter>
              <Button onClick={() => setResult(null)}>Export again</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
