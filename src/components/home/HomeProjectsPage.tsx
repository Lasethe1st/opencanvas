import { useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { GitBranchIcon, PlusSignIcon, Search02Icon } from '@hugeicons/core-free-icons';
import type { RecentProject } from '../../../shared/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ProjectThumb, timeAgo } from './AllProjectsPage';
import { HomeEllipsisMenu, type HomeMenuAction } from './HomeItemMenu';

type Sort = 'recent' | 'name';

const bytesText = (bytes?: number) => {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
};

/** Every project as a card in the main pane. The left lane stays; this replaces the chat area while it is open. */
export function HomeProjectsPage({
  recent,
  busy,
  onOpen,
  onNew,
  menuFor,
}: {
  recent: RecentProject[] | null;
  busy: boolean;
  onOpen: (root: string) => void;
  onNew: () => void;
  menuFor: (project: RecentProject) => HomeMenuAction[];
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (recent ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.openedAt - a.openedAt));
  }, [recent, query, sort]);

  return (
    <section aria-label="Projects" className="absolute inset-0 z-[15] overflow-y-auto bg-[var(--home-card)] pb-10 pt-[68px]">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[30px] font-normal leading-tight tracking-[-0.01em]">Projects</h1>
          <Button type="button" className="rounded-[var(--pill)]" onClick={onNew} disabled={busy}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-4" aria-hidden />
            New project
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search projects</span>
            <HugeiconsIcon icon={Search02Icon} strokeWidth={2} className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="text" aria-label="Search projects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              className="h-9 w-full rounded-[var(--pill)] border-0 bg-foreground/[0.06] ps-9 pe-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:bg-foreground/[0.09]"
            />
          </label>
          <div role="radiogroup" aria-label="Sort projects" className="inline-flex h-9 items-center rounded-[var(--pill)] bg-foreground/[0.06] p-0.5 text-[13px]">
            {([['recent', 'Recent'], ['name', 'Name']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={sort === id}
                onClick={() => setSort(id)}
                className={cn('h-8 rounded-[var(--pill)] px-3.5 transition-colors duration-150', sort === id ? 'bg-background text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.14)] [[data-theme=dark]_&]:bg-foreground/[0.2] [[data-theme=dark]_&]:shadow-none' : 'text-muted-foreground hover:text-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {recent === null ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[132px] rounded-2xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground">{recent.length === 0 ? 'No projects yet. Projects you open or create show up here.' : `No projects match “${query.trim()}”.`}</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3 p-0">
            {shown.map((p) => {
              const meta = [timeAgo(p.openedAt), bytesText(p.bytes)].filter(Boolean).join(' · ');
              return (
                <li key={p.root} className="group relative flex h-[132px] flex-col justify-between rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] p-4 transition-[background-color,translate] duration-200 hover:-translate-y-0.5 hover:bg-foreground/[0.05] focus-within:bg-foreground/[0.05] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <button type="button" title={p.root} aria-label={`Open ${p.name}`} disabled={busy} onClick={() => onOpen(p.root)} className="absolute inset-0 rounded-2xl outline-offset-2 disabled:cursor-default" />
                  <div className="pointer-events-none flex items-start">
                    <ProjectThumb icon={p.icon} name={p.name} className="size-12" />
                  </div>
                  <div className="pointer-events-none min-w-0">
                    <strong className="block truncate text-sm font-medium">{p.name}</strong>
                    <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      {p.git && <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} className="size-3 shrink-0" aria-label="Git project" />}
                      <span className="truncate">{meta}</span>
                    </span>
                  </div>
                  <div className="absolute end-2 top-2 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    <HomeEllipsisMenu actions={menuFor(p)} label={`${p.name} options`} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
