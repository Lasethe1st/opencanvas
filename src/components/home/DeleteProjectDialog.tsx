import { useState } from 'react';
import type { RecentProject } from '../../../shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HomeDialog } from './HomeDialog';

/** Deleting a project removes its folder from disk, so the button stays off until the folder's name is typed. */
export function DeleteProjectDialog({
  project,
  onClose,
  onDelete,
}: {
  project: RecentProject;
  onClose: () => void;
  onDelete: (typedName: string) => Promise<void>;
}) {
  const folder = project.root.split(/[\\/]/).filter(Boolean).pop() ?? project.name;
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim() === folder && !busy;
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(typed.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not delete the project.');
      setBusy(false);
    }
  };
  return (
    <HomeDialog
      title="Delete project"
      onClose={onClose}
      narrow
      footer={
        <Button
          type="button"
          variant="destructive"
          disabled={!ready}
          onClick={() => void submit()}
          className="w-full bg-[var(--destructive)] text-white hover:bg-[var(--destructive)] hover:brightness-95 disabled:opacity-45"
          style={{ backgroundColor: 'var(--destructive)' }}
        >
          {busy ? 'Deleting…' : 'Delete from disk'}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="m-0 text-muted-foreground">
          This permanently deletes the folder <strong className="font-medium text-foreground">{folder}</strong> and everything in it from your computer. It can't be undone.
        </p>
        <p className="m-0 break-all text-xs text-muted-foreground">{project.root}</p>
        <label className="flex flex-col gap-1.5">
          <span>
            Type <strong className="font-medium text-foreground">{folder}</strong> to confirm
          </span>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={!!error} />
        </label>
        {error && (
          <p role="alert" className="m-0 text-destructive">
            {error}
          </p>
        )}
      </form>
    </HomeDialog>
  );
}
