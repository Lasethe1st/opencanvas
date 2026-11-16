import { useCallback, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { GitBranchIcon, PlusSignIcon, Search02Icon, StarIcon } from '@hugeicons/core-free-icons';
import type { RecentProject } from '../../../shared/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { timeAgo } from './AllProjectsPage';
import { HomeBloomContextMenu, type HomeMenuAction } from './HomeItemMenu';

type Sort = 'recent' | 'name';

const FAV_KEY = 'oc.favorite.projects';
const loadFavorites = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
};

/** A project card is a portrait rectangle: a neutral block where a preview image will go (the top THUMB of the card), then the details. */
const THUMB = '50%';

/** Four cards to a row when there is room; fewer in a narrow pane. */
const GRID = 'm-0 grid list-none grid-cols-2 gap-4 p-0 @3xl/card:grid-cols-3 @5xl/card:grid-cols-4';

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
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const toggleFavorite = useCallback((root: string) => {
    setFavorites((cur) => {
      const next = cur.includes(root) ? cur.filter((r) => r !== root) : [root, ...cur];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: favorites last until reload */
      }
      return next;
    });
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (recent ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
    const fav = (p: RecentProject) => (favorites.includes(p.root) ? 0 : 1);
    return [...list].sort((a, b) => fav(a) - fav(b) || (sort === 'name' ? a.name.localeCompare(b.name) : b.openedAt - a.openedAt));
  }, [recent, query, sort, favorites]);

  return (
    <section aria-label="Projects" className="absolute inset-0 z-[15] overflow-y-auto bg-[var(--home-card)] pb-10 pt-[68px]">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-6">
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
          <div className={GRID}>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground">{recent.length === 0 ? 'No projects yet. Projects you open or create show up here.' : `No projects match “${query.trim()}”.`}</p>
        ) : (
          <ul className={GRID}>
            {shown.map((p) => {
              const fav = favorites.includes(p.root);
              return (
                <HomeBloomContextMenu key={p.root} actions={menuFor(p)} className="contents">
                <li className="group relative isolate flex aspect-[3/4] flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-background transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(0_0_0/0.10)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <div className="relative shrink-0 bg-foreground/[0.07]" style={{ height: THUMB }}>
                    <div className="absolute end-2 top-2 z-20 flex items-center gap-1 [&_button]:bg-black/35 [&_button]:text-white [&_button]:backdrop-blur-md [&_button:hover]:bg-black/50">
                      <button
                        type="button"
                        aria-pressed={fav}
                        aria-label={fav ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
                        onClick={() => toggleFavorite(p.root)}
                        className={cn('inline-flex size-7 items-center justify-center rounded-full outline-offset-2 transition-[opacity,background-color] duration-150', fav ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100')}
                      >
                        <HugeiconsIcon icon={StarIcon} strokeWidth={2} className={cn('size-4 transition-colors duration-150', fav && 'text-amber-300 [&_path]:fill-amber-300')} aria-hidden />
                      </button>
                    </div>
                  </div>
                  <button type="button" title={p.description ? `${p.name}: ${p.description}` : p.root} aria-label={`Open ${p.name}`} disabled={busy} onClick={() => onOpen(p.root)} className="absolute inset-0 z-10 cursor-pointer rounded-2xl border-0 bg-transparent p-0 outline-offset-2 disabled:cursor-default" />
                  <div className="pointer-events-none flex min-h-0 flex-1 flex-col gap-1.5 p-3.5 text-start">
                    <strong className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">{p.name}</strong>
                    {p.description && <p className="m-0 line-clamp-3 text-[12.5px] leading-snug text-muted-foreground">{p.description}</p>}
                    <span className="mt-auto flex items-center gap-1 text-[11.5px] text-muted-foreground">
                      {p.git && <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} className="size-3 shrink-0" aria-label="Git project" />}
                      Last modified {timeAgo(p.openedAt)}
                    </span>
                  </div>
                </li>
                </HomeBloomContextMenu>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
