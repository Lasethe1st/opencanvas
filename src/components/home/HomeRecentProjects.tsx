import type { RecentProject } from '../../../shared/types';
import { HomeEllipsisMenu, type HomeMenuAction } from './HomeItemMenu';
import { ProjectThumb, timeAgo } from './AllProjectsPage';

/** The few most recent projects under the composer: icon, name, when you last opened it, and a menu of actions. */
export function HomeRecentProjects({
  recent,
  limit = 5,
  onOpen,
  actionsFor,
  onViewAll,
}: {
  recent: RecentProject[] | null;
  limit?: number;
  onOpen: (project: RecentProject) => void;
  actionsFor: (project: RecentProject) => HomeMenuAction[];
  onViewAll?: () => void;
}) {
  if (!recent || recent.length === 0) return null;
  const shown = recent.slice(0, limit);
  return (
    <section className="mx-auto mt-7 w-full max-w-[460px]" aria-label="Recent projects">
      <div className="mb-1 flex items-center justify-between px-3">
        <h2 className="m-0 text-xs font-medium text-muted-foreground">Recent projects</h2>
        {recent.length > limit && onViewAll && (
          <button type="button" onClick={onViewAll} className="rounded text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            View all
          </button>
        )}
      </div>
      <div className="flex flex-col" role="list">
        {shown.map((project) => (
          <div
            key={project.root}
            role="listitem"
            className="group flex items-center gap-3 rounded-[var(--r-lg)] ps-3 pe-2 transition-colors duration-150 hover:bg-accent/70 focus-within:bg-accent/70"
          >
            <button
              type="button"
              title={project.root}
              aria-label={`Open ${project.name}`}
              onClick={() => onOpen(project)}
              className="flex min-w-0 flex-1 items-center gap-3 py-2 text-start outline-none"
            >
              <ProjectThumb icon={project.icon} name={project.name} className="size-10" />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-medium text-foreground">{project.name}</strong>
                <span className="block truncate text-xs text-muted-foreground">Opened {timeAgo(project.openedAt)}</span>
              </span>
            </button>
            <HomeEllipsisMenu actions={actionsFor(project)} label={`More options for ${project.name}`} />
          </div>
        ))}
      </div>
    </section>
  );
}
