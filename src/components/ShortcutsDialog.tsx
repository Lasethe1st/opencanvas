import { Fragment } from 'react';
import { SHORTCUT_GROUPS } from '../lib/shortcuts';
import { setState, useStore } from '../lib/store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/lime/ui/dialog';

export function ShortcutsDialog() {
  const open = useStore((s) => s.shortcutsOpen);
  const close = () => setState({ shortcutsOpen: false });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Keys that work while OpenCanvas is focused.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-fg">{group.title}</h2>
              <dl className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-3">
                    <dt className="text-sm text-fg">{item.label}</dt>
                    <dd className="flex flex-wrap items-center justify-end gap-1">
                      {item.keys.map((combo, i) => (
                        <Fragment key={i}>
                          {i > 0 && <span className="text-xs text-fg-3">or</span>}
                          <span className="inline-flex gap-0.5">
                            {combo.map((k) => (
                              <kbd key={k} className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">
                                {k}
                              </kbd>
                            ))}
                          </span>
                        </Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
