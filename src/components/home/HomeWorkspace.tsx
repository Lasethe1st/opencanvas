import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudIcon, LaptopMinimalIcon } from "@hugeicons/core-free-icons";
import type { RecentProject } from "../../../shared/types";
import { Check } from "../../lib/home-icons";
import { ProjectFolderIcon } from "./ProjectFolderIcon";
import { GitBranch } from "../../lib/hugeicons";
import { api } from "../../lib/api";
import { getState, setState, toast, useStore } from "../../lib/store";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Branches {
  current: string | null;
  branches: string[];
}

/** Which project the composer is about, and its git branches. Cloud projects live in a git repository; local ones are a folder on this computer. */
function useWorkspace(projects: RecentProject[]) {
  const open = useStore((s) => s.project ?? null);
  const contextRoot = useStore((s) => s.homeContextRoot);
  const fallback = (open ? projects.find((p) => p.root === open.root) : null) ?? projects[0] ?? null;
  const shown = (contextRoot ? projects.find((p) => p.root === contextRoot) : null) ?? fallback;
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
  return { shown, folder, root, info, isRepo, branchText, load, switchTo };
}

/** Padding (20) + icon (16) + gap (6) around the label. */
const PILL_CHROME = 42;

const pillClass =
  "relative flex h-8 min-w-0 max-w-[190px] shrink items-center gap-1.5 overflow-hidden rounded-[var(--pill)] border-0 bg-foreground/[0.07] px-2.5 text-xs text-foreground outline-none transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none hover:bg-foreground/[0.12] data-[state=open]:bg-foreground/[0.12]";

/**
 * The file being worked on: its icon and name, cut short when long. A cloud project shows the git icon and the
 * branch instead. Clicking it picks the project (local) or the branch (cloud).
 */
export function HomeProjectPill({ projects, onOpenProjects, side = "top" }: { projects: RecentProject[]; onOpenProjects: () => void; side?: "top" | "bottom" }) {
  const mode = useStore((s) => s.homeWorkspace);
  const w = useWorkspace(projects);
  const cloud = mode === "cloud";
  const label = cloud ? w.branchText : w.folder;
  // The pill fits its content and glides between widths: the text is measured off-screen, then the width is set so it can transition.
  const measure = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    if (measure.current) setWidth(Math.ceil(measure.current.offsetWidth) + PILL_CHROME);
  }, [label, cloud]);
  return (
    <DropdownMenu onOpenChange={(o) => o && w.load()}>
      <DropdownMenuTrigger asChild>
        <button type="button" data-home-project="" className={pillClass} style={{ width }} aria-label={cloud ? `Git branch, ${label}` : `Project, ${label}`} title={cloud ? `${w.folder} · ${label}` : w.root ?? label}>
          {cloud ? (
            <GitBranch size={14} className="shrink-0 text-[var(--layer-form)]" />
          ) : (
            <ProjectFolderIcon name={label} className="size-4" />
          )}
          <span className="min-w-0 truncate">{label}</span>
          <span ref={measure} aria-hidden className="pointer-events-none invisible absolute start-0 top-0 whitespace-nowrap">
            {label}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" sideOffset={8} className="z-[120] max-h-[280px] min-w-[220px] max-w-[320px] overflow-y-auto rounded-2xl p-1">
        {cloud ? (
          w.isRepo ? (
            w.info!.branches.map((b) => (
              <DropdownMenuItem key={b} className="rounded-xl text-xs" onSelect={() => void w.switchTo(b)}>
                <Check className={`size-3.5 ${b === w.info!.current ? "" : "opacity-0"}`} />
                <span className="min-w-0 flex-1 truncate">{b}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem className="rounded-xl text-xs" onSelect={onOpenProjects}>
              {w.root ? "Not a git repository" : "Pick a project"}
            </DropdownMenuItem>
          )
        ) : (
          projects.slice(0, 6).map((p) => (
            <DropdownMenuItem key={p.root} className="rounded-xl text-xs" title={p.root} onSelect={() => setState({ homeContextRoot: p.root })}>
              <Check className={`size-3.5 ${p.root === w.shown?.root ? "" : "opacity-0"}`} />
              <ProjectFolderIcon name={p.name} className="size-4" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-xl text-xs" onSelect={onOpenProjects}>
          Browse folders…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SEGMENTS = [
  { id: "local", label: "Local", hint: "A folder on this computer", icon: LaptopMinimalIcon },
  { id: "cloud", label: "Cloud", hint: "A project in a git repository", icon: CloudIcon },
] as const;

/** Local or cloud, as two icons with a thumb that slides between them. */
export function HomeLocationToggle({ className }: { className?: string }) {
  const mode = useStore((s) => s.homeWorkspace);
  const index = mode === "cloud" ? 1 : 0;
  const choose = (id: "local" | "cloud") => {
    setState({ homeWorkspace: id });
    try {
      localStorage.setItem("oc.home.workspace", id);
    } catch {
      /* storage blocked */
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label="Where the project lives"
      data-home-location=""
      className={cn("relative inline-grid h-8 shrink-0 grid-cols-2 rounded-[var(--pill)] bg-foreground/[0.07] p-[2px]", className)}
    >
      <span
        aria-hidden
        className="absolute start-[2px] top-[2px] size-7 rounded-full bg-background shadow-[0_1px_3px_rgb(0_0_0/0.18)] [[data-theme=dark]_&]:bg-foreground/[0.22] [[data-theme=dark]_&]:shadow-none motion-safe:transition-transform motion-safe:duration-[380ms] motion-safe:ease-[cubic-bezier(0.34,1.45,0.64,1)]"
        style={{ transform: `translateX(${index * 28}px)` }}
      />
      {SEGMENTS.map((s, i) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={i === index}
          aria-label={s.label}
          title={`${s.label} — ${s.hint}`}
          onClick={() => choose(s.id)}
          className={cn(
            "relative z-10 grid size-7 place-items-center rounded-full border-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 motion-safe:transition-[color,transform] motion-safe:duration-300",
            i === index ? "scale-100 text-foreground" : "scale-90 text-muted-foreground hover:text-foreground",
          )}
        >
          <HugeiconsIcon icon={s.icon} size={15} strokeWidth={1.8} aria-hidden />
        </button>
      ))}
    </div>
  );
}
