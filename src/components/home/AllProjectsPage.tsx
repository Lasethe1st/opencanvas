import type { RecentProject } from '../../../shared/types';
import { openRecent } from '../../lib/actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';


export function timeAgo(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatBytes(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/** Every project icon is shown in one colour (#e8e8e8 in light, #1d1d1f in dark), so a list of mixed favicons reads as a set.
 *  The favicon keeps its own light and dark shapes: it is greyscaled and blended over the tile, so its shape survives in one colour. */
export function ProjectThumb({ icon, name, className = 'size-10' }: { icon?: string | null; name: string; className?: string }) {
  const shell = cn(
    className,
    'relative isolate shrink-0 overflow-hidden rounded-[28%] bg-[#e8e8e8] dark:bg-[#1d1d1f] [[data-theme=dark]_&]:bg-[#1d1d1f] [corner-shape:squircle]',
  );
  if (icon) {
    return (
      <span className={shell}>
        <img src={icon} alt="" draggable={false} className="size-full object-cover mix-blend-multiply [[data-theme=dark]_&]:mix-blend-screen [filter:grayscale(1)_contrast(0.7)_brightness(1.2)]" />
      </span>
    );
  }
  return (
    <span
      className={cn(shell, 'flex items-center justify-center font-medium text-foreground/70', className === 'size-10' ? 'text-sm' : 'text-[10px]')}
      aria-hidden
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

/** Compact project list for the home right panel. */
export function AllProjectsList({ recent }: { recent: RecentProject[] | null }) {
  if (recent !== null && recent.length === 0) {
    return (
      <Empty className="border-0 py-10">
        <EmptyHeader>
          <EmptyTitle>No projects yet</EmptyTitle>
          <EmptyDescription>Projects you open or create will show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (recent === null) {
    return (
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-2 py-2">
            <Skeleton className="size-10 rounded-[28%] [corner-shape:squircle]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5" role="list" aria-label="Projects">
      {recent.map((project) => (
        <button
          key={project.root}
          type="button"
          role="listitem"
          title={project.root}
          aria-label={`Open ${project.name}`}
          onClick={() => void openRecent(project.root)}
          className="flex w-full items-start gap-2.5 rounded-[var(--r-lg)] px-2 py-2 text-start transition-colors duration-150 hover:bg-accent focus-visible:bg-accent"
        >
          <ProjectThumb icon={project.icon} name={project.name} />
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm font-medium">{project.name}</strong>
            <span className="block truncate text-xs text-muted-foreground">
              {timeAgo(project.openedAt)}
              <span aria-hidden> · </span>
              {formatBytes(project.bytes)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
