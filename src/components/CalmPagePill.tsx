import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { createPage, designPages, focusPage } from '../lib/pages';
import { PAGE_ICONS, PAGE_ICON_WORDS, setPageIcon, usePageIcon, type PageIconName } from '../lib/page-icons';
import { activeFrame, pageOf, useStore } from '../lib/store';

/** A page's icon; click it in the list to choose another (kept on this device). */
function PageIconButton({ page, root }: { page: { id: string; name: string; path?: string }; root: string | undefined }) {
  const { icon, name } = usePageIcon(root, page.id, page.path);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const anchor = useRef<HTMLElement | null>(null);
  const query = q.trim().toLowerCase();
  const names = (Object.keys(PAGE_ICONS) as PageIconName[]).filter((n) => !query || `${n} ${PAGE_ICON_WORDS[n]}`.includes(query));
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Trigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={`Change icon for ${page.name}`}
          title="Change icon"
          onClick={(e) => {
            anchor.current = e.currentTarget.closest('[role=dialog]');
            e.stopPropagation();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              anchor.current = e.currentTarget.closest('[role=dialog]');
              setOpen((o) => !o);
            }
          }}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.09] hover:text-foreground focus-visible:bg-foreground/[0.09]"
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content data-tw="" side="right" align="start" sideOffset={8} collisionPadding={12} onClick={(e) => e.stopPropagation()} className="z-[130] w-[248px] rounded-2xl border border-[color:var(--line)] bg-popover p-2 text-popover-foreground shadow-[var(--shadow-md)] outline-none">
          <div className="h-[196px] overflow-y-auto rounded-xl" role="listbox" aria-label="Page icons">
            <div className="sticky top-0 z-10 bg-popover pb-1.5">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search icons"
                aria-label="Search icons"
                className="h-8 w-full rounded-lg border-0 bg-foreground/[0.06] px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:bg-foreground/[0.09]"
              />
            </div>
            {names.length ? (
              <div className="grid grid-cols-6 gap-1">
                {names.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="option"
                    aria-selected={name === n}
                    aria-label={n}
                    title={n}
                    onClick={() => {
                      setPageIcon(root, page.id, n);
                      setOpen(false);
                    }}
                    className={cn('flex size-9 items-center justify-center rounded-lg border-0 bg-transparent text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.07] hover:text-foreground', name === n && 'bg-foreground/[0.09] text-foreground')}
                  >
                    <HugeiconsIcon icon={PAGE_ICONS[n]} strokeWidth={2} className="size-[18px]" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">No icons match</div>
            )}
          </div>
          {name && (
            <button type="button" onClick={() => { setPageIcon(root, page.id, null); setOpen(false); }} className="mt-1 w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground">
              Reset to default
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The calm canvas shows one page at a time; this pill names it and switches to another. */
export function CalmPagePill({ className, side = 'bottom' }: { className?: string; side?: 'top' | 'bottom' }) {
  const config = useStore((s) => s.projectConfig);
  const current = useStore((s) => pageOf(activeFrame(s), s));
  const root = useStore((s) => s.project?.root);
  const cur = usePageIcon(root, current?.id ?? '', current?.path);
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
          <HugeiconsIcon icon={cur.icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{current.name}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-tw=""
          side={side}
          align={side === 'top' ? 'start' : 'center'}
          sideOffset={8}
          collisionPadding={12}
          className="z-[120] w-[300px] rounded-2xl border border-[color:var(--line)] bg-popover p-1.5 text-popover-foreground shadow-[var(--shadow-md)] outline-none"
        >
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pages</div>
          <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto" role="listbox" aria-label="Pages">
            {pages.map((p) => {
              const on = p.id === current.id;
              return (
                <div key={p.id} className={cn('flex w-full items-center gap-1 rounded-xl px-1 transition-colors hover:bg-foreground/[0.06]', on && 'bg-foreground/[0.06]')}>
                  <PageIconButton page={p} root={root} />
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      setOpen(false);
                      focusPage(p.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border-0 bg-transparent py-1.5 pe-1.5 text-left outline-none"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-foreground">{p.name}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{p.path}</span>
                    </span>
                    {on && <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4 shrink-0" />}
                  </button>
                </div>
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
