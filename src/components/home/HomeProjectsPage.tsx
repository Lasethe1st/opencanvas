import { useCallback, useId, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { GitBranchIcon, PlusSignIcon, Search02Icon, StarIcon } from '@hugeicons/core-free-icons';
import type { RecentProject } from '../../../shared/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { timeAgo } from './AllProjectsPage';
import { HomeEllipsisMenu, type HomeMenuAction } from './HomeItemMenu';

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

const hueOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
};

/** Four folders to a row when there is room; fewer in a narrow pane. */
const GRID = 'm-0 grid list-none grid-cols-2 gap-x-4 gap-y-7 p-0 @3xl/card:grid-cols-3 @5xl/card:grid-cols-4';

/** A minimal, realistic folder: a darker back with its tab, a sheet of paper, and a lit front. Each project keeps one colour,
 *  picked from its name. On hover the front dips and the paper rises, as if the folder were about to open. */
function Folder({ hue, children }: { hue: number; children?: React.ReactNode }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className="relative mx-auto w-full max-w-[210px] transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
      <svg viewBox="0 0 200 160" className="block w-full overflow-visible drop-shadow-[0_10px_14px_rgb(0_0_0/0.16)]" aria-hidden>
        <defs>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={`hsl(${hue} 62% 72%)`} />
            <stop offset="1" stopColor={`hsl(${hue} 52% 60%)`} />
          </linearGradient>
          <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={`hsl(${hue} 42% 52%)`} />
            <stop offset="1" stopColor={`hsl(${hue} 42% 45%)`} />
          </linearGradient>
        </defs>
        <path d="M14 12h54c6 0 9 2 13 7l4 6h101c8 0 14 6 14 14v103c0 8-6 14-14 14H14c-8 0-14-6-14-14V26c0-8 6-14 14-14z" fill={`url(#b${id})`} />
        <g className="transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover:-translate-y-2.5 motion-reduce:transition-none">
          <rect x="14" y="30" width="172" height="80" rx="6" fill="#fff" fillOpacity="0.92" />
          <rect x="26" y="44" width="70" height="5" rx="2.5" fill="#000" fillOpacity="0.08" />
          <rect x="26" y="56" width="110" height="5" rx="2.5" fill="#000" fillOpacity="0.06" />
        </g>
        <g className="transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover:translate-y-0.5 motion-reduce:transition-none">
          <path d="M0 62c0-8 6-14 14-14h172c8 0 14 6 14 14v84c0 8-6 14-14 14H14c-8 0-14-6-14-14z" fill={`url(#f${id})`} />
          <path d="M14 48.5h172c7 0 12.5 4.5 13.7 10.5-1.5-4-5.5-7-11-7H12c-5.500 0-9.500 3-11 7 1-5.500 6-10.500 13-10.500z" fill="#fff" fillOpacity="0.5" />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-[8%] top-[48%] flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Every project as a folder in the main pane. The left lane stays; this replaces the chat area while it is open. */
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
              <Skeleton key={i} className="aspect-[5/4] rounded-2xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground">{recent.length === 0 ? 'No projects yet. Projects you open or create show up here.' : `No projects match “${query.trim()}”.`}</p>
        ) : (
          <ul className={GRID}>
            {shown.map((p) => {
              const fav = favorites.includes(p.root);
              const h = hueOf(p.name);
              return (
                <li key={p.root} className="group relative isolate flex flex-col items-center gap-3">
                  <Folder hue={h}>
                    <span className="flex size-12 items-center justify-center overflow-hidden rounded-[24%] bg-white/30 text-xl font-medium text-white shadow-[0_4px_12px_-4px_rgb(0_0_0/0.35)] backdrop-blur-[2px]">
                      {p.icon ? <img src={p.icon} alt="" draggable={false} className="size-full object-cover" /> : (p.name.trim()[0] ?? '?').toUpperCase()}
                    </span>
                  </Folder>
                  <button type="button" title={p.description ? `${p.name}: ${p.description}` : p.root} aria-label={`Open ${p.name}`} disabled={busy} onClick={() => onOpen(p.root)} className="absolute inset-0 z-10 rounded-2xl outline-offset-4 disabled:cursor-default" />
                  <div className="pointer-events-none flex min-w-0 max-w-full flex-col items-center text-center">
                    <strong className="max-w-full truncate text-[14px] font-medium leading-tight text-foreground">{p.name}</strong>
                    <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                      {p.git && <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} className="size-3 shrink-0" aria-label="Git project" />}
                      Last modified {timeAgo(p.openedAt)}
                    </span>
                  </div>

                  <div className="absolute end-1 top-1 z-20 flex items-center gap-1 [&_button]:bg-black/35 [&_button]:text-white [&_button]:backdrop-blur-md [&_button:hover]:bg-black/50">
                    <button
                      type="button"
                      aria-pressed={fav}
                      aria-label={fav ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
                      onClick={() => toggleFavorite(p.root)}
                      className={cn('inline-flex size-7 items-center justify-center rounded-full outline-offset-2 transition-[opacity,background-color] duration-150', fav ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100')}
                    >
                      <HugeiconsIcon icon={StarIcon} strokeWidth={2} className={cn('size-4 transition-colors duration-150', fav && 'text-amber-300 [&_path]:fill-amber-300')} aria-hidden />
                    </button>
                    <div className="[&_button]:rounded-full [&_button]:border-0 [&_button]:opacity-100">
                      <HomeEllipsisMenu actions={menuFor(p)} label={`${p.name} options`} />
                    </div>
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
