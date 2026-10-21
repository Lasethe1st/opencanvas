import { setState, useStore } from '../lib/store';
import { plural } from '../lib/plural';
import { Button } from '@/components/lime/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lime/ui/dialog';
import { List, ListItem } from '@/components/lime/ui/list';

/** What OpenCanvas found in a project it just unpacked from a ZIP. */
export function ImportSummaryDialog() {
  const imported = useStore((s) => s.importSummary);
  const close = () => setState({ importSummary: null });
  const summary = imported?.summary;
  const rows: [string, string][] = summary
    ? [
        ['Framework', summary.framework],
        ['Package manager', summary.packageManager],
        ['Routing', summary.router ?? 'Single page'],
        ['Tailwind CSS', summary.tailwind ? 'Detected' : 'Not used'],
        ['shadcn/ui', summary.shadcn ? 'Detected (components.json)' : 'Not used'],
        ['Scripts', summary.scripts.length ? summary.scripts.join(', ') : 'None'],
      ]
    : [];

  return (
    <Dialog open={!!imported} onOpenChange={(next) => !next && close()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Project imported</DialogTitle>
          <DialogDescription>
            {imported
              ? `Unpacked ${plural(imported.fileCount, 'file', 'files')}${
                  imported.skipped ? `, skipping ${plural(imported.skipped, 'file', 'files')} from node_modules, .git and build output` : ''
                }.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        {summary && (
          <>
            <List variant="grouped">
              {rows.map(([k, v]) => (
                <ListItem key={k} title={k} description={v} chevron={false} />
              ))}
            </List>
            <p className="text-sm text-fg-2">{summary.editing}</p>
          </>
        )}
        <DialogFooter>
          <Button autoFocus onClick={close}>
            Start editing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
