import { setState, useStore } from '../lib/store';
import { Dialog } from '../ui/Overlays.jsx';
import { Button } from '../ui/primitives.jsx';
import { plural } from '../lib/plural';

/** What OpenCanvas found in a project it just unpacked from a ZIP. */
export function ImportSummaryDialog() {
  const imported = useStore((s) => s.importSummary);
  if (!imported) return null;
  const { summary, fileCount, skipped } = imported;
  const close = () => setState({ importSummary: null });
  const rows: [string, string][] = [
    ['Framework', summary.framework],
    ['Package manager', summary.packageManager],
    ['Routing', summary.router ?? 'Single page'],
    ['Tailwind CSS', summary.tailwind ? 'Detected' : 'Not used'],
    ['shadcn/ui', summary.shadcn ? 'Detected (components.json)' : 'Not used'],
    ['Scripts', summary.scripts.length ? summary.scripts.join(', ') : 'None'],
  ];
  return (
    <Dialog
      title="Project imported"
      onClose={close}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        close();
      }}
    >
      <span className="muted">
        Unpacked {plural(fileCount, 'file', 'files')}
        {skipped ? `, skipping ${plural(skipped, 'file', 'files')} from node_modules, .git and build output` : ''}.
      </span>
      <dl className="import-summary">
        {rows.map(([k, v]) => (
          <div key={k} className="import-summary__row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="import-summary__editing">{summary.editing}</p>
      <Button variant="primary" onClick={close} autoFocus>
        Start editing
      </Button>
    </Dialog>
  );
}
