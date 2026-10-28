import { ArrowCounterClockwise, Brain, CaretDown, CaretRight, Check, CircleNotch, DotsSixVertical, DotsThree, ListNumbers, Pause, Pencil, Question, Trash, X } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  providerMeta,
  type AiChatItem,
  type AiModel,
  type AiProviderKind,
  type AiSettings,
  type AiThinkingEffort,
} from "../../../shared/ai";
import { openAiSettings, refreshAiStatus } from "../../lib/ai";
import { ModelLogo } from "./ModelLogo";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const EFFORTS: { id: AiThinkingEffort; label: string; hint: string }[] = [
  { id: "low", label: "Instant", hint: "Faster, lighter replies" },
  { id: "medium", label: "Balanced", hint: "Balanced" },
  { id: "high", label: "Harder", hint: "Slower, deeper reasoning" },
];

const PREVIEW = 5;

/** Flat catalog shown in the composer — picking one switches provider + model. */
const CATALOG: { id: string; label: string; hint?: string; provider: AiProviderKind }[] = [
  { id: "claude-opus", hint: "Best for complex coding and long tasks", label: "Claude Opus", provider: "anthropic" },
  { id: "claude-sonnet", hint: "Great for everyday coding and writing", label: "Claude Sonnet", provider: "anthropic" },
  { id: "claude-haiku", hint: "Fastest, light on tokens", label: "Claude Haiku", provider: "anthropic" },
  { id: "fable-5.1", hint: "Strong reasoning for hard problems", label: "Fable 5.1", provider: "openai" },
  { id: "gpt-6", hint: "Top OpenAI model for demanding work", label: "GPT-6", provider: "openai" },
  { id: "gpt-4o", hint: "Great for day-to-day tasks", label: "GPT-4o", provider: "openai" },
  { id: "gemini-2.5-pro", hint: "Best for long documents and reasoning", label: "Gemini 2.5 Pro", provider: "gemini" },
  { id: "gemini-2.5-flash", hint: "Fast and light on tokens", label: "Gemini 2.5 Flash", provider: "gemini" },
  { id: "astra", hint: "Quick, conversational answers", label: "Astra", provider: "xai" },
  { id: "grok-3", hint: "Great for day-to-day questions", label: "Grok 3", provider: "xai" },
  { id: "clade", hint: "Balanced all-rounder", label: "Clade", provider: "openai" },
  { id: "llama3.2", hint: "Runs on your computer, no tokens used", label: "llama3.2", provider: "ollama" },
];

type PickerModel = { id: string; label: string; hint?: string; provider: AiProviderKind };

const PROVIDER_ORDER: AiProviderKind[] = ["anthropic", "openai", "gemini", "xai", "ollama", "lmstudio", "custom"];

function mergeModels(live: AiModel[], provider: AiProviderKind): PickerModel[] {
  const byId = new Map<string, PickerModel>();
  for (const m of CATALOG) byId.set(m.id, m);
  for (const m of live) {
    if (!byId.has(m.id)) byId.set(m.id, { id: m.id, label: m.label || m.id, provider });
  }
  return [...byId.values()];
}

function modelLabel(settings: AiSettings, models: PickerModel[], loading: boolean): string {
  const fromList = models.find((m) => m.id === settings.model)?.label;
  if (fromList) return fromList;
  if (settings.model) return settings.model;
  if (loading) return "Loading…";
  return providerMeta(settings.provider).product;
}

/** Rough context window by model id — used only for the usage ring. */
function contextWindow(model: string): number {
  const id = model.toLowerCase();
  if (id.includes("claude") || id.includes("opus") || id.includes("sonnet") || id.includes("haiku")) return 200_000;
  if (id.includes("gemini")) return 1_000_000;
  if (id.includes("grok") || id.includes("astra")) return 131_072;
  if (id.includes("gpt-4o") || id.includes("gpt-6") || id.includes("fable") || id.includes("clade")) return 128_000;
  if (id.includes("llama")) return 128_000;
  return 128_000;
}

function chatChars(items: AiChatItem[]): number {
  let n = 0;
  for (const item of items) {
    if (item.kind === "user" || item.kind === "assistant" || item.kind === "error") n += item.text.length;
    else if (item.kind === "tool") n += item.tool.length + item.summary.length;
    else if (item.kind === "question") n += item.question.question.length + (item.answer?.length ?? 0);
    else if (item.kind === "approval") n += item.approval.summary.length + (item.answer?.length ?? 0);
  }
  return n;
}

/** ~4 chars/token — estimate until the API reports usage. */
function estimateTokens(chars: number): number {
  return Math.max(0, Math.ceil(chars / 4));
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * Meter geometry drives popup width:
 *   width = padX * 2 + count * pill + (count - 1) * gap
 */
/** Tip width = 12*2 + 48*2 + 47*2 = 214 — room for “What does this mean?” on one line. */
const TIP_METER = { count: 48, pill: 2, gap: 2, padX: 12, height: 24 } as const;
const DETAIL_PAD_X = 20;
const DETAIL_MIN_WIDTH = 500;

type QueueTask = {
  id: string;
  label: string;
  status: "running" | "done" | "paused" | "queued";
};

type MeterGeom = { count: number; pill: number; gap: number; padX: number; height: number };

function meterInnerWidth(m: Pick<MeterGeom, "count" | "pill" | "gap">): number {
  return m.count * m.pill + Math.max(0, m.count - 1) * m.gap;
}

function popupWidth(m: MeterGeom): number {
  return m.padX * 2 + meterInnerWidth(m);
}

/** Usage band for the meter: green → yellow → red as the window fills. */
function usageTone(pct: number): { fill: string; ring: string; label: string } {
  if (pct >= 0.9) return { fill: "#ef4444", ring: "text-[#ef4444]", label: "Critical" };
  if (pct >= 0.7) return { fill: "#eab308", ring: "text-[#eab308]", label: "High" };
  return { fill: "#22c55e", ring: "text-[#22c55e]", label: "Healthy" };
}

function UsagePillMeter({
  filled,
  geom,
  fill,
}: {
  filled: number;
  geom: Pick<MeterGeom, "count" | "pill" | "gap" | "height">;
  fill: string;
}) {
  return (
    <div
      className="flex shrink-0 items-center"
      style={{ width: meterInnerWidth(geom), height: geom.height, gap: geom.gap }}
      aria-hidden
    >
      {Array.from({ length: geom.count }, (_, i) => (
        <span
          key={i}
          className="shrink-0 rounded-[3px]"
          style={{
            width: geom.pill,
            height: geom.height,
            backgroundColor: i < filled ? fill : "color-mix(in oklab, var(--fg) 18%, transparent)",
          }}
        />
      ))}
    </div>
  );
}

function ContextUsageRing({ used, limit, className }: { used: number; limit: number; className?: string }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const pct = limit > 0 ? Math.min(1, used / limit) : 0;
  const filled = Math.round(pct * TIP_METER.count);
  const remaining = Math.max(0, limit - used);
  const tone = usageTone(pct);
  const title = `${formatTokens(used)} tokens used · ${formatTokens(remaining)} context left`;
  const tipW = popupWidth(TIP_METER);
  // Nothing to report until the conversation has some content.
  const empty = used <= 0;

  const openDetail = () => {
    setTipOpen(false);
    setDetailOpen(true);
  };

  if (empty) return null;

  return (
    <>
      <Tooltip
        open={detailOpen ? false : tipOpen}
        onOpenChange={setTipOpen}
        delayDuration={200}
        disableHoverableContent={false}
      >
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-6 shrink-0 items-center justify-center rounded-[var(--pill)] px-2 text-[11px] font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              pct > 0 ? tone.ring : "text-muted-foreground hover:text-foreground",
              className,
            )}
            aria-label={title}
            aria-haspopup="dialog"
            aria-expanded={detailOpen}
            onClick={openDetail}
          >
            {Math.max(1, Math.round(pct * 100))}%
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="end"
          sideOffset={10}
          className="pointer-events-auto box-border max-w-none rounded-2xl border-0 bg-[color:var(--surface-3)]/90 py-3 text-left font-normal text-foreground shadow-[var(--shadow-md)] backdrop-blur-[20px] backdrop-saturate-150"
          style={{ width: tipW, paddingInline: TIP_METER.padX }}
        >
          <UsagePillMeter filled={filled} geom={TIP_METER} fill={tone.fill} />
          <ul className="mt-2.5 flex flex-col gap-1.5 text-[11px] leading-none text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone.fill }} aria-hidden />
              <span>
                <span className="font-medium text-foreground">{formatTokens(used)}</span> tokens used
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-foreground/35" aria-hidden />
              <span>
                <span className="font-medium text-foreground">{formatTokens(remaining)}</span> context left
              </span>
            </li>
          </ul>
          <button
            type="button"
            className="mt-2.5 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openDetail();
            }}
          >
            <Question className="size-3.5 shrink-0 opacity-80" />
            What does this mean?
          </button>
        </TooltipContent>
      </Tooltip>

      {detailOpen && (
        <UsageDetailDialog
          used={used}
          limit={limit}
          remaining={remaining}
          pct={pct}
          tone={tone}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

function UsageDetailDialog({
  used,
  limit,
  remaining,
  pct,
  tone,
  onClose,
}: {
  used: number;
  limit: number;
  remaining: number;
  pct: number;
  tone: { fill: string; ring: string; label: string };
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const aiChat = useStore((s) => s.aiChat);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-tw="">
      {/* Dim only — no blur. Transparent so the frame can frost the page behind it. */}
      <button type="button" aria-label="Close usage details" className="absolute inset-0 bg-transparent" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] w-full min-w-[min(100%,500px)] max-w-[500px] rounded-3xl border border-[color:var(--line)] text-foreground shadow-[0_0_0_100vmax_rgba(0,0,0,0.55),var(--shadow-lg)] backdrop-blur-[20px] backdrop-saturate-150"
        style={{
          width: DETAIL_MIN_WIDTH,
          backgroundColor: "color-mix(in oklab, var(--surface-3) 70%, transparent)",
        }}
      >
        <div className="flex max-h-[min(80vh,560px)] flex-col overflow-hidden overscroll-contain rounded-[inherit]">
          <div className="flex items-center justify-between gap-3 py-3" style={{ paddingInline: DETAIL_PAD_X }}>
            <h2 id={titleId} className="text-sm font-medium">
              Context usage
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-[var(--pill)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto overscroll-contain pb-5" style={{ paddingInline: DETAIL_PAD_X }}>
            <div
              className="h-2 w-full overflow-hidden rounded-[var(--pill)] bg-foreground/15"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct * 100)}
              aria-label="Context window used"
            >
              <div
                className="h-full rounded-[var(--pill)] transition-[width] duration-200"
                style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct * 100)}%`, backgroundColor: tone.fill }}
              />
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-end justify-between gap-3">
                <p className="text-[28px] font-medium leading-none tracking-tight tabular-nums">{Math.round(pct * 100)}%</p>
                <span
                  className="shrink-0 rounded-[var(--pill)] px-2.5 py-1 text-[11px] font-medium"
                  style={{ backgroundColor: `color-mix(in oklab, ${tone.fill} 18%, transparent)`, color: tone.fill }}
                >
                  {tone.label}
                </span>
              </div>

              <dl className="flex flex-col gap-2 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Tokens used</dt>
                  <dd className="font-medium tabular-nums text-foreground">{formatTokens(used)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Context left</dt>
                  <dd className="font-medium tabular-nums text-foreground">{formatTokens(remaining)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Window size</dt>
                  <dd className="font-medium tabular-nums text-foreground">{formatTokens(limit)}</dd>
                </div>
              </dl>
            </div>

            <UsageTaskQueue chat={aiChat} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function tasksFromChat(chat: AiChatItem[]): QueueTask[] {
  const fromTools = chat
    .filter((i): i is Extract<AiChatItem, { kind: "tool" }> => i.kind === "tool")
    .map((i) => ({
      id: i.id,
      label: i.summary.replace(/…$/u, "").trim() || i.tool,
      status: (i.state === "running" ? "running" : i.state === "failed" ? "paused" : "done") as QueueTask["status"],
    }));
  if (fromTools.length) return fromTools;
  return [
    { id: "demo-1", label: "Center the divs", status: "running" },
    { id: "demo-2", label: "Change Color", status: "done" },
  ];
}

function UsageTaskQueue({ chat }: { chat: AiChatItem[] }) {
  const [tasks, setTasks] = useState<QueueTask[]>(() => tasksFromChat(chat));
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    setTasks(tasksFromChat(chat));
  }, [chat]);

  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setTasks((list) => {
      const from = list.findIndex((t) => t.id === fromId);
      const to = list.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const patch = (id: string, status: QueueTask["status"]) => {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, status } : t)));
  };

  const remove = (id: string) => {
    setTasks((list) => list.filter((t) => t.id !== id));
  };

  const onDragStart = (e: DragEvent, id: string) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const onDrop = (e: DragEvent, id: string) => {
    e.preventDefault();
    const from = dragId.current ?? e.dataTransfer.getData("text/plain");
    if (from) move(from, id);
    dragId.current = null;
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">Tasks</p>
      <ul className="flex flex-col gap-0.5" aria-label="Task queue">
        {tasks.map((task) => (
          <li
            key={task.id}
            draggable
            onDragStart={(e) => onDragStart(e, task.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, task.id)}
            className="group flex items-center gap-1.5 rounded-lg py-1 pe-0.5 ps-0.5 transition-colors duration-150 hover:bg-background/35"
          >
            <span
              className="inline-flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
              aria-hidden
            >
              <DotsSixVertical className="size-3.5 opacity-50" />
            </span>
            <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
              {task.status === "running" ? (
                <CircleNotch className="size-3.5 animate-spin" />
              ) : task.status === "done" ? (
                <Check className="size-3.5 text-foreground" />
              ) : task.status === "paused" ? (
                <Pause className="size-3.5" />
              ) : (
                <ListNumbers className="size-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{task.label}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--pill)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={`Actions for ${task.label}`}
                >
                  <DotsThree className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="min-w-[140px] rounded-2xl p-1">
                {task.status === "running" && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                    onClick={() => patch(task.id, "paused")}
                  >
                    <Pause className="size-3.5 opacity-70" /> Pause
                  </button>
                )}
                {(task.status === "paused" || task.status === "done") && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                    onClick={() => patch(task.id, "queued")}
                  >
                    <ListNumbers className="size-3.5 opacity-70" /> Queue
                  </button>
                )}
                {task.status === "queued" && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                    onClick={() => patch(task.id, "running")}
                  >
                    <CircleNotch className="size-3.5 opacity-70" /> Run
                  </button>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => {
                    const next = window.prompt("Edit task", task.label);
                    if (next?.trim()) {
                      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, label: next.trim() } : t)));
                    }
                  }}
                >
                  <Pencil className="size-3.5 opacity-70" /> Edit
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => patch(task.id, "running")}
                >
                  <ArrowCounterClockwise className="size-3.5 opacity-70" /> Try again
                </button>
                <DropdownMenuSeparator className="bg-border/60" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs text-destructive hover:bg-accent"
                  onClick={() => remove(task.id)}
                >
                  <Trash className="size-3.5 opacity-70" /> Delete
                </button>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Model + thinking + context usage under the home composer. */
export function HomeComposerExtras() {
  const status = useStore((s) => s.aiStatus);
  const settings = status?.settings;
  const aiChat = useStore((s) => s.aiChat);
  const dockDraft = useStore((s) => s.dockDraft);
  const [live, setLive] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  const usage = useMemo(() => {
    const model = settings?.model ?? "";
    const limit = contextWindow(model);
    const used = estimateTokens(chatChars(aiChat) + dockDraft.length);
    return { used, limit };
  }, [aiChat, dockDraft, settings?.model]);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    setLoading(true);
    void api.ai
      .listModels()
      .then((list) => {
        if (!cancelled) setLive(list);
      })
      .catch(() => {
        if (!cancelled) setLive([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [settings?.provider, settings?.baseUrl, status?.ready]);

  if (!settings) return null;

  const models = mergeModels(live, settings.provider);
  const effort = settings.thinkingEffort ?? "medium";
  const effortMeta = EFFORTS.find((e) => e.id === effort) ?? EFFORTS[1];
  const label = modelLabel(settings, models, loading);
  const providers = PROVIDER_ORDER.map((provider) => ({ provider, models: models.filter((m) => m.provider === provider) })).filter((g) => g.models.length > 0);

  const save = async (patch: Partial<AiSettings>) => {
    await api.ai.setSettings({ ...settings, ...patch });
    await refreshAiStatus();
  };

  const pickModel = (m: PickerModel) => {
    const meta = providerMeta(m.provider);
    void save({
      provider: m.provider,
      baseUrl: meta.defaultBaseUrl || settings.baseUrl,
      model: m.id,
    });
    setMenuOpen(false);
    setAllOpen(false);
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-start gap-0 px-1">
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 max-w-[220px] gap-1 rounded-[var(--pill)] px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=open]:bg-transparent"
          >
            <ModelLogo provider={settings.provider} />
            <span className="truncate">{label}</span>
            <CaretDown className="size-3.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={6}
          className="min-w-[220px] rounded-3xl border-0 p-1.5 shadow-[var(--shadow-md)]"
        >
          {models.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              {loading ? "Loading models…" : "No models listed — set one in Settings › AI."}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {providers.map(({ provider, models: list }) => (
                <DropdownMenuSub key={provider}>
                  <DropdownMenuSubTrigger className="rounded-xl text-xs">
                    <ModelLogo provider={provider} />
                    <span className="min-w-0 flex-1 truncate">{providerMeta(provider).product}</span>
                    {settings.provider === provider && <Check className="size-3.5 shrink-0 opacity-80" />}
                    <CaretRight className="size-3.5 shrink-0 opacity-60" />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[260px] rounded-3xl p-1.5">
                    {list.map((m) => (
                      <DropdownMenuItem key={m.id} className="flex-col items-stretch gap-0 rounded-xl px-2.5 py-1.5" onSelect={() => pickModel(m)}>
                        <span className="flex items-center gap-2 text-xs text-foreground">
                          <span className="min-w-0 flex-1 truncate">{m.label}</span>
                          {settings.model === m.id && settings.provider === m.provider && <Check className="size-3.5 shrink-0 opacity-80" />}
                        </span>
                        {m.hint && <span className="text-[11px] leading-4 text-muted-foreground">{m.hint}</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </div>
          )}
          <DropdownMenuSeparator className="bg-border/60" />
          <DropdownMenuItem
            className="rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:text-foreground"
            onSelect={() => openAiSettings()}
          >
            Open Settings › AI
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-[var(--pill)] px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=open]:bg-transparent"
            aria-label={`Thinking effort: ${effortMeta.label}`}
            title={effortMeta.hint}
          >
            <Brain className="size-3.5 shrink-0 opacity-70" />
            <span>{effortMeta.label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={6}
          className="min-w-[180px] rounded-3xl border-0 p-1.5 shadow-[var(--shadow-md)]"
        >
          <DropdownMenuRadioGroup value={effort} onValueChange={(id) => void save({ thinkingEffort: id as AiThinkingEffort })}>
            {EFFORTS.map((e) => (
              <DropdownMenuRadioItem key={e.id} value={e.id} className="rounded-xl text-xs" title={e.hint}>
                {e.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ContextUsageRing used={usage.used} limit={usage.limit} className="ms-auto" />

      {allOpen && (
        <AllModelsDialog
          models={models}
          selectedId={settings.model}
          onPick={pickModel}
          onClose={() => setAllOpen(false)}
        />
      )}
    </div>
  );
}

function AllModelsDialog({
  models,
  selectedId,
  onPick,
  onClose,
}: {
  models: PickerModel[];
  selectedId: string;
  onPick: (m: PickerModel) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-tw="">
      <button
        type="button"
        aria-label="Close model list"
        className="absolute inset-0 bg-black/55"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] flex max-h-[min(70vh,520px)] w-full max-w-[400px] flex-col overflow-hidden rounded-3xl bg-card/80 text-foreground shadow-[var(--shadow-lg)] backdrop-blur-[20px] backdrop-saturate-150"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 id={titleId} className="text-sm font-medium">
            Models
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-[var(--pill)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          <div className="flex flex-col gap-0.5" role="listbox" aria-label="All models">
            {models.map((m) => {
              const selected = selectedId === m.id;
              return (
                <button
                  key={`${m.provider}:${m.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    selected ? "bg-accent text-foreground" : "text-foreground",
                  )}
                  onClick={() => onPick(m)}
                >
                  <ModelLogo provider={m.provider} />
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  {selected && <Check className="size-3.5 shrink-0 opacity-80" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
