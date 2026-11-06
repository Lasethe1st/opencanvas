import { useCallback, useEffect, useState } from "react";
import type { RecentProject } from "../../../shared/types";
import { Check, FolderOpen } from "../../lib/home-icons";
import { GitBranch } from "../../lib/hugeicons";
import { api } from "../../lib/api";
import { toast, useStore } from "../../lib/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HomeComposerExtras } from "./HomeComposerExtras";

/** Peeking strip above the start composer, plus the slice tucked under it. */
const PEEK = 32;
const TUCK = 10;
const INSET = 24;

const controlClass =
  "flex h-7 min-w-0 max-w-[11rem] items-center gap-1.5 rounded-[var(--pill)] border-0 bg-transparent px-2 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground data-[state=open]:text-foreground";

interface Branches {
  current: string | null;
  branches: string[];
}

/**
 * Back card of the home chat start composer.
 * Narrower than the field, one control row peeking above it, and a few pixels tucked underneath.
 * Branch, the project folder, and the model picker live here. Both chips open a menu.
 */
export function HomeComposerShadow({
  projects,
  onOpenProject,
  onOpenProjects,
}: {
  /** Recent projects, newest first. The first is shown when no project is open. */
  projects: RecentProject[];
  onOpenProject: (root: string) => void;
  /** Opens the full projects dialog. */
  onOpenProjects: () => void;
}) {
  const open = useStore((s) => s.project ?? null);
  const shown = (open ? projects.find((p) => p.root === open.root) : null) ?? projects[0] ?? null;
  const folder = open?.name ?? shown?.name ?? "No project";
  const root = shown?.root ?? null;
  const [info, setInfo] = useState<Branches | null | undefined>(undefined);

  const load = useCallback(() => {
    if (!root) return setInfo(null);
    void api.git
      .branchesOf(root)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [root]);

  useEffect(() => {
    setInfo(undefined);
    load();
  }, [load]);

  const switchTo = async (name: string) => {
    if (!root || name === info?.current) return;
    try {
      await api.git.switchBranch(root, name);
      toast(`Switched to ${name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't switch branch", "error");
    }
    load();
  };

  const isRepo = !!info && (info.current !== null || info.branches.length > 0);
  const branchText = info === undefined ? "Git" : (info?.current ?? (isRepo ? "detached" : "No branch"));

  return (
    <div
      data-home-composer-shadow=""
      className="relative z-0 overflow-hidden bg-[var(--composer-shadow)]"
      style={{
        marginInline: INSET,
        marginBottom: -TUCK,
        height: PEEK + TUCK,
        borderRadius: 20,
        cornerShape: "squircle",
      } as React.CSSProperties}
    >
      <div className="flex min-w-0 items-center gap-0.5 px-1.5" style={{ height: PEEK }}>
        <DropdownMenu onOpenChange={(o) => o && load()}>
          <DropdownMenuTrigger asChild>
            <button type="button" data-home-branch="" className={controlClass} aria-label={`Git branch, ${branchText}`} title={branchText}>
              <GitBranch size={14} className="shrink-0" />
              <span className="truncate">{branchText}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="z-[120] max-h-[280px] min-w-[220px] overflow-y-auto rounded-2xl p-1">
            {isRepo ? (
              info!.branches.map((b) => (
                <DropdownMenuItem key={b} className="rounded-xl text-xs" onSelect={() => void switchTo(b)}>
                  <Check className={`size-3.5 ${b === info!.current ? "" : "opacity-0"}`} />
                  <span className="min-w-0 flex-1 truncate">{b}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem className="rounded-xl text-xs" onSelect={onOpenProjects}>
                {root ? "Not a git repository" : "Open a project to use a branch"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" data-home-project="" className={controlClass} aria-label={`Project folder, ${folder}`} title={folder}>
              <FolderOpen className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{folder}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="z-[120] min-w-[220px] max-w-[320px] rounded-2xl p-1">
            {projects.slice(0, 6).map((p) => (
              <DropdownMenuItem key={p.root} className="rounded-xl text-xs" title={p.root} onSelect={() => onOpenProject(p.root)}>
                <Check className={`size-3.5 ${p.root === shown?.root ? "" : "opacity-0"}`} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
            {projects.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem className="rounded-xl text-xs" onSelect={onOpenProjects}>
              Open another folder…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <HomeComposerExtras variant="shadow" />
        </div>
      </div>
    </div>
  );
}
