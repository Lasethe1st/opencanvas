import { useCallback, useMemo, useState } from 'react';
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

const BLUR_LAYERS = 5;
/** Four to a row when there is room; fewer in a narrow pane. */
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
              <Skeleton key={i} className="aspect-[2/3] rounded-2xl" />
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
                <li key={p.root} className="group relative isolate aspect-[2/3] overflow-hidden rounded-2xl bg-muted shadow-[0_0_0_1px_rgb(0_0_0/0.06)] transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-10px_rgb(0_0_0/0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 [[data-theme=dark]_&]:shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
                  {p.image ? (
                    <img src={p.image} alt="" draggable={false} className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
                  ) : (
                    <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(160deg, hsl(${h} 42% 64%), hsl(${(h + 40) % 360} 46% 36%))` }}>
                      <span className="absolute start-1/2 top-[26%] flex size-16 -translate-x-1/2 items-center justify-center overflow-hidden rounded-[22%] bg-white/25 text-2xl font-medium text-white shadow-[0_6px_18px_-6px_rgb(0_0_0/0.4)] backdrop-blur-sm">
                        {p.icon ? <img src={p.icon} alt="" draggable={false} className="size-full object-cover" /> : (p.name.trim()[0] ?? '?').toUpperCase()}
                      </span>
                    </div>
                  )}
                  <button type="button" title={p.root} aria-label={`Open ${p.name}`} disabled={busy} onClick={() => onOpen(p.root)} className="absolute inset-0 z-10 rounded-2xl outline-offset-2 disabled:cursor-default" />

                  {/* The name block: the image blurs more and more toward the bottom and settles into the pane colour. */}
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%]">
                    {Array.from({ length: BLUR_LAYERS }, (_, i) => {
                      const solid = Math.max(0, 70 - i * 15);
                      const mask = `linear-gradient(to top, #000 0%, #000 ${solid}%, transparent ${solid + 30}%)`;
                      const blur = `blur(${0.75 * 2 ** i}px)`;
                      return <div key={i} className="absolute inset-0" style={{ backdropFilter: blur, WebkitBackdropFilter: blur, maskImage: mask, WebkitMaskImage: mask }} />;
                    })}
                    <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--home-card)_94%,transparent)] via-[color-mix(in_srgb,var(--home-card)_62%,transparent)] to-transparent" />
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
                    <strong className="truncate text-[15px] font-medium leading-tight text-foreground">{p.name}</strong>
                    {p.description && <span className="line-clamp-2 text-[12px] leading-snug text-foreground/70">{p.description}</span>}
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      {p.git && <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} className="size-3 shrink-0" aria-label="Git project" />}
                      Last visited {timeAgo(p.openedAt)}
                    </span>
                  </div>

                  <div className="absolute end-2 top-2 z-20 flex items-center gap-1 [&_button]:bg-black/35 [&_button]:text-white [&_button]:backdrop-blur-md [&_button:hover]:bg-black/50">
                    <button
                      type="button"
                      aria-pressed={fav}
                      aria-label={fav ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
                      onClick={() => toggleFavorite(p.root)}
                      className={cn('inline-flex size-7 items-center justify-center rounded-full outline-offset-2 transition-[opacity,background-color] duration-150', fav ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100')}
                    >
                      <HugeiconsIcon icon={StarIcon} strokeWidth={2} className={cn('size-4 transition-colors duration-150', fav && 'text-amber-300 [&_path]:fill-amber-300')} aria-hidden />
                    </button>
                    <div className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
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
