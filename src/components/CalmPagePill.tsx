import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, ArrowDown01Icon, File02Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { createPage, designPages, focusPage } from '../lib/pages';
import { activeFrame, pageOf, useStore } from '../lib/store';

/** The calm canvas shows one page at a time; this pill names it and switches to another. */
export function CalmPagePill({ className }: { className?: string }) {
  const config = useStore((s) => s.projectConfig);
  const current = useStore((s) => pageOf(activeFrame(s), s));
  useStore((s) => s.frames);
  const busy = useStore((s) => s.busy);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  if (!config || !current) return null;
  const pages = designPages();
  const canAdd = config.canEditPages;

  const commit = () => {
    const value = name.trim();
    setAdding(false);
    setName('');
    if (value) void createPage(value, 'design');
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setAdding(false); setName(''); } }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Page: ${current.name}. Switch page`}
          className={cn(
            'calm-pill flex h-9 max-w-[180px] items-center gap-1.5 rounded-full border-0 bg-muted px-3.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-secondary data-[state=open]:bg-secondary',
            className,
          )}
        >
          <span className="min-w-0 truncate">{current.name}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className="z-[120] w-[240px] rounded-2xl border border-[color:var(--line)] bg-popover p-1.5 text-popover-foreground shadow-[var(--shadow-md)] outline-none"
        >
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pages</div>
          <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto" role="listbox" aria-label="Pages">
            {pages.map((p) => {
              const on = p.id === current.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    setOpen(false);
                    focusPage(p.id);
                  }}
                  className={cn('flex w-full items-center gap-2 rounded-xl border-0 bg-transparent px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-foreground/[0.06]', on && 'bg-foreground/[0.06]')}
                >
                  <HugeiconsIcon icon={File02Icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-foreground">{p.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{p.path}</span>
                  </span>
                  {on && <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="mx-2.5 my-1.5 h-px bg-border/70" />
          {adding ? (
            <input
              autoFocus
              value={name}
              placeholder="Page name"
              aria-label="New page name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setAdding(false);
                  setName('');
                }
              }}
              onBlur={commit}
              className="mx-1 h-8 w-[calc(100%-8px)] rounded-lg border border-[color:var(--line)] bg-background px-2.5 text-sm text-foreground outline-none"
            />
          ) : (
            <button
              type="button"
              disabled={!canAdd || busy}
              title={canAdd ? undefined : (config.pagesNote ?? 'Pages can’t be added here')}
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-2 rounded-xl border-0 bg-transparent px-2.5 py-1.5 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4 shrink-0" />
              New page
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
