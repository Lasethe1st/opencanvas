import { FolderOpen } from "@phosphor-icons/react";
import type { AiChatItem } from "../../../shared/ai";
import { AgentOrb, type AgentOrbVariant } from "@/components/ui/agent-orb";
import { useStore } from "../../lib/store";
import { cn } from "@/lib/utils";

function runningStatus(chat: AiChatItem[], turnId: string | null): { label: string; variant: AgentOrbVariant } | null {
  if (!turnId) return null;
  const waiting = chat.some((i) => (i.kind === "question" || i.kind === "approval") && i.answer === null);
  if (waiting) return { label: "Waiting for your answer", variant: "C2" };
  const tool = [...chat].reverse().find((i) => i.kind === "tool" && i.state === "running");
  if (tool && tool.kind === "tool") {
    const s = tool.summary.replace(/…$/u, "").trim();
    return { label: s || tool.tool, variant: "S3" };
  }
  return { label: "Working…", variant: "S2" };
}

/** Status pills above the home composer: open project (if any) + current work. */
export function HomeStatusPills({
  className,
  onOpenProjects,
}: {
  className?: string;
  onOpenProjects?: () => void;
}) {
  const turnId = useStore((s) => s.aiTurnId);
  const chat = useStore((s) => s.aiChat);
  const projectName = useStore((s) => s.project?.name ?? null);
  const run = runningStatus(chat, turnId);

  if (!projectName && !run) return null;

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {projectName && (
        <button
          type="button"
          className="inline-flex max-w-[min(100%,240px)] items-center gap-2 rounded-[var(--pill)] bg-[color:var(--surface-3)]/90 px-3 py-2.5 text-[length:var(--chat-font-size)] font-normal text-foreground shadow-[var(--shadow-sm)] backdrop-blur-[12px] backdrop-saturate-150 transition-colors hover:bg-[color:var(--surface-3)]"
          title={projectName}
          onClick={onOpenProjects}
        >
          <FolderOpen className="size-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="min-w-0 truncate">{projectName}</span>
        </button>
      )}
      {run && (
        <div
          className="inline-flex max-w-full items-center gap-2 rounded-[var(--pill)] bg-[color:var(--surface-3)]/90 px-3 py-2.5 text-[length:var(--chat-font-size)] font-normal text-foreground shadow-[var(--shadow-sm)] backdrop-blur-[12px] backdrop-saturate-150"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden className="shrink-0 text-foreground">
            <AgentOrb variant={run.variant} size={14} label={run.label} style={{ color: "currentColor" }} />
          </span>
          <span className="min-w-0 truncate">{run.label}</span>
        </div>
      )}
    </div>
  );
}
