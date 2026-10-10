import { CheckCircle2, FileArchive, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import type { ExportResult } from '../../shared/types';
import { errorMessage } from '../lib/actions';
import { api } from '../lib/api';
import { hasUnsaved, setState, toast, useStore } from '../lib/store';
import { Dialog, ExportOption } from '../ui/Overlays.jsx';
import { Button, Notice } from '../ui/primitives.jsx';

export function ExportDialog() {
  const open = useStore((s) => s.exportOpen);
  const project = useStore((s) => s.project);
  const dirty = useStore((s) => hasUnsaved(s));
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  if (!open || !project) return null;
  const close = () => {
    setState({ exportOpen: false });
    setResult(null);
  };

  const exportZip = async () => {
    setWorking(true);
    try {
      const res = await api.exportZip();
      if (res.ok) setResult(res);
    } catch (err) {
      toast(`Export failed: ${errorMessage(err)}`, 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog
      title="Export project"
      onClose={close}
      onKeyDown={(e) => e.key === 'Escape' && close()}
    >
      {dirty && <Notice>The code editor has unsaved changes. They will not be included until you save.</Notice>}
      {!result ? (
        <>
          <span className="muted">Download a clean copy of your project to run anywhere.</span>
          <ExportOption icon={<FileArchive size={17} />} title={working ? 'Packaging…' : 'Download project ZIP'} onClick={() => void exportZip()} disabled={working}>
            <span>Source, config and assets. Excludes node_modules, build output and local env files.</span>
          </ExportOption>
          <ExportOption icon={<FolderOpen size={17} />} title="Open project folder" onClick={() => void api.revealProject()}>
            <span>The project already lives on disk as a normal {project.framework === 'vite-react' ? 'React + Vite ' : ''}project.</span>
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
          <span className="muted">The exported project has no dependency on OpenCanvas.</span>
          <Button onClick={() => setResult(null)}>Export again</Button>
        </>
      )}
    </Dialog>
  );
}
