import { useCallback, useEffect, useState } from "react";
import type { RecentProject } from "../../../shared/types";
import { Check, FolderOpen } from "../../lib/home-icons";
import { GitBranch } from "../../lib/hugeicons";
import { api } from "../../lib/api";
import { getState, setState, toast, useStore } from "../../lib/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HomeContextRing } from "./HomeComposerExtras";

const controlClass =
  "flex size-8 shrink-0 items-center justify-center rounded-[var(--pill)] border-0 bg-foreground/[0.07] text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.12] hover:text-foreground data-[state=open]:text-foreground";

interface Branches {
  current: string | null;
  branches: string[];
}

/**
 * The right side of the start composer's bottom row: git branch, project context, and the context-usage ring.
 * The project chip picks context only — it does not open a project.
 */
export function HomeComposerContext({
  projects,
  onOpenProjects,
}: {
  /** Recent projects, newest first. The first is shown when no project is open. */
  projects: RecentProject[];
  /** Opens the full projects dialog. */
  onOpenProjects: () => void;
}) {
  const open = useStore((s) => s.project ?? null);
  const contextRoot = useStore((s) => s.homeContextRoot);
  const fallback = (open ? projects.find((p) => p.root === open.root) : null) ?? projects[0] ?? null;
  const shown =
    (contextRoot ? projects.find((p) => p.root === contextRoot) : null) ??
    fallback;
  useEffect(() => {
    const root = shown?.root ?? null;
    const name = shown?.name ?? null;
    const cur = getState();
    if (cur.homeProjectRoot === root && cur.homeProjectName === name) return;
    setState({ homeProjectRoot: root, homeProjectName: name });
  }, [shown?.root, shown?.name]);
  const folder = shown?.name ?? open?.name ?? "No project";
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
    <div className="flex min-w-0 items-center gap-1.5">
        <DropdownMenu onOpenChange={(o) => o && load()}>
          <DropdownMenuTrigger asChild>
            <button type="button" data-home-branch="" className={controlClass} aria-label={`Git branch, ${branchText}`} title={`Branch: ${branchText}`}>
              <GitBranch size={14} className="shrink-0 text-[var(--layer-form)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="z-[120] max-h-[280px] min-w-[220px] overflow-y-auto rounded-2xl p-1">
            {isRepo ? (
              info!.branches.map((b) => (
                <DropdownMenuItem key={b} className="rounded-xl text-xs" onSelect={() => void switchTo(b)}>
                  <Check className={`size-3.5 ${b === info!.current ? "" : "opacity-0"}`} />
                  <span className="min-w-0 flex-1 truncate">{b}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem className="rounded-xl text-xs" onSelect={onOpenProjects}>
                {root ? "Not a git repository" : "Pick a project for context"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" data-home-project="" className={controlClass} aria-label={`Project context, ${folder}`} title={`Project: ${folder}`}>
              <FolderOpen className="size-3.5 shrink-0 text-[var(--layer-media)]" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="z-[120] min-w-[220px] max-w-[320px] rounded-2xl p-1">
            {projects.slice(0, 6).map((p) => (
              <DropdownMenuItem key={p.root} className="rounded-xl text-xs" title={p.root} onSelect={() => setState({ homeContextRoot: p.root })}>
                <Check className={`size-3.5 ${p.root === shown?.root ? "" : "opacity-0"}`} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
            {projects.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem className="rounded-xl text-xs" onSelect={onOpenProjects}>
              Browse folders…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <HomeContextRing className="ms-0.5" />
    </div>
  );
}
