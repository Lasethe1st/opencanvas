import { FolderOpen, Loader2 } from "lucide-react";
import type { AiChatItem } from "../../../shared/ai";
import { useStore } from "../../lib/store";
import { cn } from "@/lib/utils";

function runningLabel(chat: AiChatItem[], turnId: string | null): string | null {
  if (!turnId) return null;
  const waiting = chat.some((i) => (i.kind === "question" || i.kind === "approval") && i.answer === null);
  if (waiting) return "Waiting for your answer";
  const tool = [...chat].reverse().find((i) => i.kind === "tool" && i.state === "running");
  if (tool && tool.kind === "tool") {
    const s = tool.summary.replace(/…$/u, "").trim();
    return s || tool.tool;
  }
  return "Working…";
}

/** Status pills above the home composer: project (left, larger) + current work. */
export function HomeStatusPills({
  className,
  recentProjectName,
  onOpenProjects,
}: {
  className?: string;
  /** Fallback when no project is open — last opened project name. */
  recentProjectName?: string | null;
  onOpenProjects?: () => void;
}) {
  const turnId = useStore((s) => s.aiTurnId);
  const chat = useStore((s) => s.aiChat);
  const projectName = useStore((s) => s.project?.name ?? null);
  const run = runningLabel(chat, turnId);
  const projectLabel = projectName || recentProjectName || "Projects";

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        className="inline-flex max-w-[min(100%,240px)] items-center gap-2 rounded-[var(--pill)] bg-[color:var(--surface-3)]/90 px-3 py-2.5 text-[length:var(--chat-font-size)] font-normal text-foreground shadow-[var(--shadow-sm)] backdrop-blur-[12px] backdrop-saturate-150 transition-colors hover:bg-[color:var(--surface-3)]"
        title={projectLabel}
        onClick={onOpenProjects}
      >
        <FolderOpen className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 truncate">{projectLabel}</span>
      </button>
      {run && (
        <div
          className="inline-flex max-w-full items-center gap-2 rounded-[var(--pill)] bg-[color:var(--surface-3)]/90 px-3 py-2.5 text-[length:var(--chat-font-size)] font-normal text-foreground shadow-[var(--shadow-sm)] backdrop-blur-[12px] backdrop-saturate-150"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin opacity-80" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 truncate">{run}</span>
        </div>
      )}
    </div>
  );
}
