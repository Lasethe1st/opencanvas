import { FolderOpen } from '../../lib/home-icons';
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AgentOrb } from "@/components/ui/agent-orb";
import { useStore } from "../../lib/store";
import type { RunningJob } from "../../lib/running-work";
import { cn } from "@/lib/utils";

const pillClass =
  "inline-flex max-w-[min(100%,240px)] items-center gap-2 rounded-[var(--pill)] border-0 bg-[color:var(--surface-3)]/90 px-3 py-2.5 text-[length:var(--chat-font-size)] font-normal text-foreground shadow-[var(--shadow-sm)] backdrop-blur-[12px] backdrop-saturate-150";

/**
 * One running-work pill above the home composer.
 * A single project shows its name and the activity orb. Several show "N running".
 * Click opens an upward frosted list of in-flight work only.
 * When nothing is running, an open canvas project can still show its name.
 * The empty start deck does not mount this, so that name is not repeated above the shadow card.
 */
export function HomeStatusPills({
  className,
  onOpenProjects,
  onOpenRunning,
}: {
  className?: string;
  onOpenProjects?: () => void;
  onOpenRunning?: (job: RunningJob) => void;
}) {
  const jobs = useStore((s) => s.runningJobs);
  const projectName = useStore((s) => s.project?.name ?? null);
  const [open, setOpen] = useState(false);

  if (!jobs.length && !projectName) return null;

  const label = jobs.length === 1 ? jobs[0].projectName : `${jobs.length} running`;

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {jobs.length > 0 ? (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={cn(pillClass, "transition-colors hover:bg-[color:var(--surface-3)]")}
              aria-label={jobs.length === 1 ? `${label}, working` : label}
              title={label}
            >
              <span aria-hidden className="shrink-0 text-foreground">
                <AgentOrb variant="S3" size={14} style={{ color: "currentColor" }} />
              </span>
              <span className="min-w-0 truncate">{label}</span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={8}
              avoidCollisions={false}
              data-tw=""
              data-home-running=""
              className="z-[130] w-[min(100vw-2rem,300px)] rounded-2xl border border-[color:var(--frost-border)] bg-[var(--frost-bg)] p-1 text-foreground shadow-[var(--shadow-md)] outline-none"
              style={{ WebkitBackdropFilter: "var(--frost-filter)", backdropFilter: "var(--frost-filter)" }}
            >
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="Running work">
                {jobs.map((job) => (
                  <li key={job.turnId}>
                    <Popover.Close asChild>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 rounded-xl border-0 bg-transparent px-3 py-2 text-left outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06]"
                        onClick={() => onOpenRunning?.(job)}
                      >
                        <span className="w-full truncate text-sm text-foreground">{job.projectName}</span>
                        {job.line && <span className="w-full truncate text-xs text-muted-foreground">{job.line}</span>}
                      </button>
                    </Popover.Close>
                  </li>
                ))}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        projectName && (
          <button
            type="button"
            className={cn(pillClass, "transition-colors hover:bg-[color:var(--surface-3)]")}
            title={projectName}
            onClick={onOpenProjects}
          >
            <FolderOpen className="size-3.5 shrink-0 opacity-80" aria-hidden />
            <span className="min-w-0 truncate">{projectName}</span>
          </button>
        )
      )}
    </div>
  );
}
