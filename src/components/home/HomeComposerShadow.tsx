import { useEffect, useState } from "react";
import type { GitStatus } from "../../../shared/types";
import { Check, FolderOpen } from "../../lib/home-icons";
import { GitBranch } from "../../lib/hugeicons";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HomeComposerExtras } from "./HomeComposerExtras";

/** Peeking strip above the start composer, plus the slice tucked under it. */
const PEEK = 40;
const TUCK = 12;
const INSET = 24;

const controlClass =
  "flex h-7 min-w-0 max-w-[11rem] items-center gap-1.5 rounded-[var(--pill)] border-0 bg-transparent px-2 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground data-[state=open]:text-foreground";

function branchLabel(status: GitStatus | null | undefined): string {
  if (!status?.installed || !status.repo) return "No branch";
  return status.branch ?? "detached";
}

/**
 * Back card of the home chat start composer.
 * Narrower than the field, one control row peeking above it, and a few pixels tucked underneath.
 * Branch, the current project folder, and the model picker live here. The picker opens downward.
 */
export function HomeComposerShadow({
  projectName,
  onOpenProjects,
  webSearch,
  onWebSearch,
}: {
  /** Name to show when no project is open — the most recent folder, when there is one. */
  projectName?: string | null;
  onOpenProjects: () => void;
  webSearch?: boolean;
  onWebSearch?: (on: boolean) => void;
}) {
  const openProject = useStore((s) => s.project?.name ?? null);
  const [status, setStatus] = useState<GitStatus | null | undefined>(undefined);
  const folder = openProject ?? projectName ?? "No project";

  useEffect(() => {
    let alive = true;
    void api.git
      .status()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch(() => {
        if (alive) setStatus(null);
      });
    return () => {
      alive = false;
    };
  }, [openProject]);

  const branch = branchLabel(status);

  return (
    <div
      data-home-composer-shadow=""
      className="relative z-0 overflow-hidden bg-[var(--composer-shadow)]"
      style={{
        marginInline: INSET,
        marginBottom: -TUCK,
        height: PEEK + TUCK,
        borderRadius: 22,
        cornerShape: "squircle",
      } as React.CSSProperties}
    >
      <div className="flex min-w-0 items-center gap-0.5 px-1.5" style={{ height: PEEK }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" data-home-branch="" className={controlClass} aria-label={`Git branch, ${branch}`} title={branch}>
              <GitBranch size={14} className="shrink-0" />
              <span className="truncate">{status === undefined ? "Git" : branch}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="z-[120] min-w-[200px] rounded-2xl p-1">
            {status?.repo ? (
              <DropdownMenuItem className="rounded-xl text-xs" onSelect={() => undefined}>
                <Check className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">{status.branch ?? "Detached HEAD"}</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="rounded-xl text-xs" onSelect={onOpenProjects}>
                Open a project to use a branch
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          data-home-project=""
          className={controlClass}
          aria-label={`Project folder, ${folder}`}
          title={folder}
          onClick={onOpenProjects}
        >
          <FolderOpen className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{folder}</span>
        </button>

        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <HomeComposerExtras variant="shadow" webSearch={webSearch} onWebSearch={onWebSearch} />
        </div>
      </div>
    </div>
  );
}
