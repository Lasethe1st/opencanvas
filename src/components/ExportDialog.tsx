import { CheckCircle2, CircleAlert, FileArchive, FolderOpen, Hammer, Info, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FRAMEWORK_LABELS, type BuildCheckResult, type ExportIssue, type ExportReport, type ExportResult } from '../../shared/types';
import { errorMessage, revealInCode } from '../lib/actions';
import { api } from '../lib/api';
import { plural } from '../lib/plural';
import { hasUnsaved, setState, toast, useStore } from '../lib/store';
import { Dialog, ExportOption } from '../ui/Overlays.jsx';
import { Button, Notice, Spinner } from '../ui/primitives.jsx';

const SEVERITY_ICON = {
  error: <CircleAlert size={14} />,
  warning: <TriangleAlert size={14} />,
  info: <Info size={14} />,
};

const MAX_LOG = 60_000;

function openIssueFile(file: string) {
  const m = /^(.*?):(\d+)$/.exec(file);
  if (m) revealInCode(m[1], Number(m[2]));
  else revealInCode(file, 1);
}

function IssueRow({ issue }: { issue: ExportIssue }) {
  return (
    <li className={`export-issue export-issue--${issue.severity}`}>
      <span className="export-issue__icon">{SEVERITY_ICON[issue.severity]}</span>
      <div className="export-issue__body">
        <strong>{issue.title}</strong>
        {issue.file && (
          <button className="source-link" onClick={() => openIssueFile(issue.file!)}>
            {issue.file}
          </button>
        )}
        <span className="muted">{issue.fix}</span>
      </div>
    </li>
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

  if (!open || !project) return null;
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

  const frameworkLabel = project.framework === 'unknown' ? '' : `${FRAMEWORK_LABELS[project.framework]} `;

  return (
    <Dialog
      title="Export project"
      data-export=""
      onClose={close}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        close();
      }}
    >
      {dirty && <Notice>The code editor has unsaved changes. They will not be included until you save.</Notice>}
      {!result ? (
        <>
          <span className="muted">Download a clean copy of your project to run anywhere.</span>
          <section className="export-report" aria-label="Export check">
            {!report ? (
              <span className="export-report__loading">
                <Spinner /> Checking what the export will contain…
              </span>
            ) : (
              <>
                <span className="export-report__summary">{reportSummary(report)}</span>
                {report.issues.length > 0 && (
                  <ul className="export-issues" tabIndex={0} aria-label="Issues found">
                    {report.issues.map((issue, i) => (
                      <IssueRow key={i} issue={issue} />
                    ))}
                  </ul>
                )}
              </>
            )}
            <div className="export-check">
              {checking ? (
                <Button size="sm" onClick={() => void api.cancelBuildCheck()}>
                  Cancel check
                </Button>
              ) : (
                <Button size="sm" icon={<Hammer size={13} />} onClick={() => void checkBuild()}>
                  Check it builds
                </Button>
              )}
              {checking ? (
                <span className="muted export-check__running">
                  <Spinner /> Installing and building a clean copy…
                </span>
              ) : (
                <span className="muted">Installs and builds a clean copy in a temporary folder. Takes a minute or two.</span>
              )}
            </div>
            {check && (
              <Notice tone={check.state === 'passed' ? 'info' : undefined} icon={check.state === 'passed' ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}>
                <strong>{CHECK_TEXT[check.state]}.</strong> {check.message}
              </Notice>
            )}
            {(checking || log) && (
              <pre className="code-block export-check__log" ref={logRef} aria-label="Build check log">
                {log || 'Starting…'}
              </pre>
            )}
          </section>
          <ExportOption icon={<FileArchive size={17} />} title={working ? 'Packaging…' : 'Download project ZIP'} onClick={() => void exportZip()} disabled={working}>
            <span>Source, config and assets. Excludes node_modules, build output and local env files.</span>
          </ExportOption>
          <ExportOption icon={<FolderOpen size={17} />} title="Open project folder" onClick={() => void api.revealProject()}>
            <span>The project already lives on disk as a normal {frameworkLabel}project.</span>
          </ExportOption>
        </>
      ) : (
        <>
          <Notice tone="info" icon={<CheckCircle2 size={15} />}>
            Exported {result.fileCount} files to{' '}
            <button className="source-link" onClick={() => result.path && void api.revealFile(result.path)}>
              {result.path}
            </button>
          </Notice>
          <span>Unzip it anywhere and run:</span>
          <pre className="code-block">{result.instructions?.join('\n')}</pre>
          {result.envExampleAdded && (
            <span className="muted">The ZIP includes a .env.example with the variable names your code reads. It has no values; fill them in after copying it to .env.</span>
          )}
          <span className="muted">The exported project has no dependency on OpenCanvas.</span>
          <Button onClick={() => setResult(null)}>Export again</Button>
        </>
      )}
    </Dialog>
  );
}
