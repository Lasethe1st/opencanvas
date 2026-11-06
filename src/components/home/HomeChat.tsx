import { highlight } from "../../lib/highlight";
import { Brain, Check, CircleNotch, ShieldWarning, SpeakerHigh, Stop, Wrench, X } from '../../lib/home-icons';
import { humanizeAiError } from "../../lib/ai-errors";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Copy01Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { ThumbsDown, ThumbsUp } from '../../lib/home-icons';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { AiChatItem } from "../../../shared/ai";
import { answerAi, approveAi, openAiSettings } from "../../lib/ai";
import { useStore } from "../../lib/store";
import { Button } from "@/components/ui/button";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ui/code-block";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import {
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { ThinkingReasoning } from "@/components/ui/thinking-reasoning";
import { getVote, isRemembered, setVote, subscribeMemory, toggleRemember, type Vote } from "../../lib/ai-memory";
import { highlightCode, highlightStyle } from "../../lib/code-highlights";
import { useThinkingPhrase, withEllipsis } from "../../lib/thinking-phrases";
import { AgentOrb } from "@/components/ui/agent-orb";
import { SOURCE_META, SourceIcon, type SourceKind } from "./SourcesPanel";
import { cn } from "@/lib/utils";
import { speakReply, stopSpeech, useSpeech } from "../../lib/read-aloud";
import { referencesIn } from "../assistant-shapes";
import { ChatMarkdown } from "./ChatMarkdown";

const TOOL_LABELS: Record<string, string> = {
  git_commit: "Save a version (commit)",
  git_publish: "Publish to GitHub",
  go_live: "Put the site online",
  import_files: "Import files into the project",
  run_command: "Run a command",
};

const FENCE_RE = /```([\w-]*)\n?([\s\S]*?)```/g;

/** Nearest ancestor set to scroll — home uses the main column, the dock uses its own log. */
/** Smooth by default; instant for people who ask their system for reduced motion. */
const scrollBehavior = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Keep the newest reply in view while the model thinks/streams, without fighting the person
 * if they've scrolled up to read. Instant scrolls — smooth ones cancel each other on every token.
 */
function useStickToBottom(rootRef: RefObject<HTMLElement | null>, items: AiChatItem[]) {
  const pinned = useRef(true);
  const [away, setAway] = useState(false);
  const jump = useCallback(() => {
    const root = rootRef.current;
    const scroller = root && (scrollParentOf(root) ?? root);
    if (!scroller) return;
    pinned.current = true;
    setAway(false);
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: scrollBehavior() });
  }, [rootRef]);

  // A fresh user message means they just sent — jump back to following the thread.
  useLayoutEffect(() => {
    if (items[items.length - 1]?.kind === "user") pinned.current = true;
  }, [items]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = scrollParentOf(root) ?? root;
    const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 64;
    const onScroll = () => {
      pinned.current = nearBottom();
      setAway(!pinned.current && scroller.scrollHeight - scroller.clientHeight > 240);
    };
    const follow = () => {
      if (!pinned.current) return;
      scroller.scrollTop = scroller.scrollHeight;
    };
    follow();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(follow);
    ro.observe(root);
    const mo = new MutationObserver(follow);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      ro.disconnect();
      mo.disconnect();
    };
  }, [rootRef]);
  return { showJump: away, jump };
}

/** Home conversation thread — grows with content; the parent column scrolls. */
/** `split`: user messages sit on the right and the AI's stay on the left (homepage and canvas chats). */
/** What the person typed, without the references and file contents the home prompt appends. */
export function typedText(text: string): string {
  return splitReferences(text).body;
}

/**
 * A faint rail of bars beside the thread, one per message you sent. The bar for the part you're reading
 * is lit; hover shows what the message said, click scrolls to it. Appears once there are three or more.
 */
/** "Today, 22:03", "Yesterday, 22:03", "Nov 5, 22:03" (with the year when it isn't this one). */
export function sentLabel(at: number, now = new Date()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
  return `${date}, ${time}`;
}

function ChatOutline({ rootRef, items, fallbackAt }: { rootRef: RefObject<HTMLElement | null>; items: AiChatItem[]; fallbackAt?: number }) {
  const marks = items.flatMap((i) =>
    i.kind === "user"
      ? [{ id: i.id, label: typedText(i.text).replace(/\s+/g, " ").trim() || "(attachment)", when: i.at ?? fallbackAt }]
      : [],
  );
  const [active, setActive] = useState<string | null>(null);
  // Pinned to the far left of the scrolling area, not beside the text column.
  const [edge, setEdge] = useState<{ left: number; top: number } | null>(null);
  const ids = marks.map((m) => m.id).join("|");

  useEffect(() => {
    const root = rootRef.current;
    if (!root || marks.length < 3) return;
    const scroller = scrollParentOf(root) ?? root;
    const place = () => {
      const r = scroller.getBoundingClientRect();
      setEdge({ left: r.left + 20, top: r.top + r.height * 0.32 });
    };
    place();
    window.addEventListener("resize", place);
    const sro = new ResizeObserver(place);
    sro.observe(scroller);
    const update = () => {
      const line = scroller.getBoundingClientRect().top + 140;
      let current = marks[0].id;
      for (const m of marks) {
        const el = root.querySelector<HTMLElement>(`[data-chat-item="${m.id}"]`);
        if (el && el.getBoundingClientRect().top <= line) current = m.id;
      }
      // At the very bottom the last message is the one in play, even if its top is far above.
      if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8) current = marks[marks.length - 1].id;
      setActive(current);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(root);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", place);
      ro.disconnect();
      sro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef, ids]);

  if (marks.length < 3 || !edge) return null;
  const go = (id: string) => {
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-chat-item="${id}"]`);
    el?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  };
  return (
    <nav
      aria-label="Conversation outline"
      className="pointer-events-none fixed z-10 hidden min-[1100px]:block"
      style={{ left: edge.left, top: edge.top }}
    >
      <ul className="pointer-events-auto m-0 flex max-h-[40vh] list-none flex-col items-start gap-2 overflow-visible p-0">
        {marks.map((m) => {
          const on = m.id === active;
          return (
            <li key={m.id} className="group/bar relative">
              <button
                type="button"
                onClick={() => go(m.id)}
                aria-label={`Go to: ${m.label}`}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex h-fit items-center border-0 bg-transparent p-0 outline-none transition-[width] duration-150",
                  on ? "w-[1rem]" : "w-[0.5rem] group-hover/bar:w-[0.75rem]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "block h-[3px] w-full rounded-full transition-[background-color] duration-150",
                    on ? "bg-foreground" : "bg-foreground/25 group-hover/bar:bg-foreground/50",
                  )}
                />
              </button>
              <span
                role="presentation"
                className="pointer-events-none absolute start-full top-1/2 z-20 ms-2 w-max max-w-[240px] -translate-y-1/2 rounded-xl bg-[var(--composer-front)] px-3 py-1.5 text-xs text-foreground opacity-0 shadow-[inset_0_0_0_1px_var(--composer-edge),var(--composer-lift)] transition-opacity duration-100 group-hover/bar:opacity-100 group-has-[:focus-visible]/bar:opacity-100"
              >
                <span className="block truncate">{m.label}</span>
                {m.when != null && <span className="mt-0.5 block text-[11px] text-muted-foreground">{sentLabel(m.when)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function HomeChat({
  mentions = false,
  split = false,
  outline = false,
  outlineFallbackAt,
  onEditLast,
}: { mentions?: boolean; split?: boolean; /** Home page only: a rail of bars beside the thread, one per message you sent. */ outline?: boolean; /** Date shown for messages saved before dates were recorded: when the chat began. */ outlineFallbackAt?: number; /** Home page only: pull the last message back into the input to change and resend. */ onEditLast?: (id: string) => void } = {}) {
  const items = useStore((s) => s.aiChat);
  const turnId = useStore((s) => s.aiTurnId);
  const rootRef = useRef<HTMLDivElement>(null);
  const busy = !!turnId;
  const lastUserId = [...items].reverse().find((i) => i.kind === "user")?.id;
  const waiting = items.some((i) => (i.kind === "question" || i.kind === "approval") && i.answer === null);
  const last = items[items.length - 1];
  const waitingOnModel =
    busy &&
    !waiting &&
    !(
      last?.kind === "assistant" ||
      last?.kind === "thinking" ||
      (last?.kind === "tool" && last.state === "running")
    );
  const thinkingPhrase = useThinkingPhrase(waitingOnModel);
  const { showJump, jump } = useStickToBottom(rootRef, items);
  const stoppedAfter = useStore((s) => s.aiStopped);

  return (
    <div ref={rootRef} className="relative w-full px-1 py-2" aria-label="Conversation">
      {outline && <ChatOutline rootRef={rootRef} items={items} fallbackAt={outlineFallbackAt} />}
      <div className="flex w-full flex-col gap-4 pb-4">
        {items.map((item) => (
          <div
            key={item.id}
            data-chat-item={item.id}
            className={
              item.kind === "user"
                ? split
                  ? "flex w-full justify-end pb-3 ps-12"
                  : "pb-3"
                : split
                  ? "w-full pe-12"
                  : undefined
            }
          >
            {(() => {
              const body = (
                <ChatItem
                  item={item}
                  mentions={mentions}
                  align={split ? (item.kind === "user" ? "end" : "start") : "start"}
                  // Hold while this reply streams; stagger-fade words when the chunk finishes.
                  pending={busy && !waiting && item.kind === "assistant" && item.id === last?.id}
                />
              );
              const canEdit = !!onEditLast && !busy && item.kind === "user";
              const stopped = stoppedAfter === item.id && !busy;
              if (!canEdit && !stopped) return body;
              const isLast = item.id === lastUserId;
              return (
                <div className={`group flex flex-col gap-0.5 ${split ? "items-end" : "items-start"}`}>
                  {body}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onEditLast(item.id)}
                      title={isLast ? undefined : "Rewinds the chat to this message"}
                      className={cn(
                        "flex items-center gap-1 rounded-[var(--pill)] border-0 bg-transparent px-2 py-1 text-xs text-muted-foreground outline-none transition-opacity hover:bg-foreground/[0.06] hover:text-foreground focus-visible:opacity-100",
                        !isLast && "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <HugeiconsIcon icon={Edit02Icon} size={13} strokeWidth={1.8} aria-hidden />
                      Edit and resend
                    </button>
                  )}
                  {stopped && (
                    <p className="m-0 flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground" role="status">
                      <Stop weight="fill" className="size-2.5" aria-hidden />
                      Stopped
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
        {waitingOnModel && (
          <div className="flex items-center gap-2" aria-live="polite">
            <span aria-hidden className="text-foreground">
              <AgentOrb variant="S2" size={20} style={{ color: "currentColor" }} />
            </span>
            <ShimmeringText key={thinkingPhrase} text={withEllipsis(thinkingPhrase)} className="text-[length:var(--chat-font-size-sm)]" startOnView={false} />
          </div>
        )}
      </div>
      {showJump && (
        <div className="pointer-events-none sticky bottom-2 z-10 flex justify-center">
          <button
            type="button"
            onClick={jump}
            className="pointer-events-auto flex h-8 items-center gap-1.5 rounded-[var(--pill)] border-0 bg-[var(--composer-front)] px-3 text-xs font-medium text-foreground shadow-[inset_0_0_0_1px_var(--composer-edge),var(--composer-lift)] outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/30"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} aria-hidden />
            Latest
          </button>
        </div>
      )}
      <p className="sr-only" role="status">
        {waiting ? "The AI is waiting for your answer." : busy ? "The AI is working." : items.length ? "The AI is done." : ""}
      </p>
    </div>
  );
}

const REF_RE = /\n\nReferenced:\n([\s\S]*)$/;
const REF_LINE = /^- \[(project|chat|file|web|google|skill)\] (.+?) \((.*)\)$/;

/** Splits the references the home prompt appends from what the user actually typed. */
const FILES_RE = /\n\nAttached files:\n([\s\S]*?)(?=\n\nReferenced:\n|$)/;

function splitReferences(raw: string): { body: string; refs: { kind: SourceKind; title: string }[] } {
  // Attached files travel as `--- name ---` blocks; the bubble shows each as a pill, not its contents.
  const fm = FILES_RE.exec(raw);
  const files = fm ? [...fm[1].matchAll(/^--- (.+) ---$/gm)].map((x) => ({ kind: "file" as SourceKind, title: x[1] })) : [];
  const text = fm ? raw.slice(0, fm.index) + raw.slice(fm.index + fm[0].length) : raw;
  const m = REF_RE.exec(text);
  if (!m) return { body: text, refs: files };
  const refs = m[1]
    .split("\n")
    .map((line) => REF_LINE.exec(line))
    .filter((x): x is RegExpExecArray => !!x)
    .map((x) => ({ kind: x[1] as SourceKind, title: x[2] }));
  return { body: text.slice(0, m.index), refs: [...files, ...refs] };
}

/** One line is a full pill; as the text wraps the corners ease down to 18px, always as smooth squircle corners. */
function bubbleRadius(height: number): string {
  if (height <= 56) return `${Math.round(height / 2)}px`;
  return `${Math.round(Math.max(18, Math.min(height / 2, 28 - (height - 56) * 0.15)))}px`;
}

const REF_PILL =
  "inline-flex max-w-[16rem] items-center gap-1.5 rounded-[var(--pill)] bg-foreground/[0.07] px-2 pt-1.5 pb-1 text-[0.92em] leading-[1.35] text-foreground";

/** Refs sit under the message: one named pill, or a count when there are several. */
function RefPills({ refs }: { refs: { kind: SourceKind; title: string }[] }) {
  if (!refs.length) return null;
  if (refs.length === 1) {
    const r = refs[0];
    return (
      <div className="flex flex-wrap items-center gap-0.5">
        <span className={REF_PILL} title={r.title}>
          <SourceIcon kind={r.kind} className="size-3.5 shrink-0" />
          <span className="truncate">{r.title}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <span className={REF_PILL} title={refs.map((r) => r.title).join(", ")}>
        {refs.length}
      </span>
    </div>
  );
}

function UserBubble({ text, mentions = false, align = "start" }: { text: string; mentions?: boolean; align?: "start" | "end" }) {
  const { body, refs: homeRefs } = splitReferences(text);
  const canvasRefs = mentions
    ? referencesIn(body).map((r) => ({
        kind: (r.kind === "page" ? "file" : "project") as SourceKind,
        title: r.name,
      }))
    : [];
  const refs = mentions ? canvasRefs : homeRefs;
  const [radius, setRadius] = useState("var(--pill)");
  const [wrapped, setWrapped] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      setRadius(bubbleRadius(el.offsetHeight));
      setWrapped(el.offsetHeight > 56);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [body, refs.length]);
  // In split (project) chat, keep the bubble under ~80% so it can sit on the right.
  const shell = align === "end" ? "flex w-fit max-w-[min(100%,80%)] flex-col items-end gap-0.5" : "flex w-fit max-w-full flex-col gap-0.5";
  return (
    <div className={shell}>
      <div
        ref={boxRef}
        style={{ borderRadius: radius, cornerShape: wrapped ? "squircle" : "round" } as React.CSSProperties}
        className="w-fit max-w-full bg-muted px-4 py-3 motion-safe:transition-[border-radius] motion-safe:duration-150"
      >
        <p className="m-0 break-words text-[length:var(--chat-font-size)] leading-relaxed text-foreground [overflow-wrap:anywhere] whitespace-pre-wrap">{highlightCode(body).map((part, i) => (part.kind ? <span key={i} style={highlightStyle(part)}>{part.text}</span> : part.text))}</p>
      </div>
      <RefPills refs={refs} />
    </div>
  );
}

function ChatItem({
  item,
  mentions,
  pending = false,
  align = "start",
}: {
  item: AiChatItem;
  mentions: boolean;
  pending?: boolean;
  align?: "start" | "end";
}) {
  switch (item.kind) {
    case "user":
      return <UserBubble text={item.text} mentions={mentions} align={align} />;
    case "assistant":
      return <AssistantMessage id={item.id} text={item.text} pending={pending} />;
    case "thinking":
      return <ThinkingTrace item={item} />;
    case "error":
      return <ErrorMessage text={item.text} />;
    case "tool":
      return <ToolTrace item={item} />;
    case "question":
      return <QuestionCard item={item} />;
    case "approval":
      return <ApprovalCard item={item} />;
  }
}

/** Streamed model reasoning — aicss Thinking + Reasoning block. */
function ThinkingTrace({ item }: { item: Extract<AiChatItem, { kind: "thinking" }> }) {
  return <ThinkingReasoning text={item.text} done={item.done} />;
}

function ToolTrace({ item }: { item: Extract<AiChatItem, { kind: "tool" }> }) {
  const status = item.state === "running" ? "running" : item.state === "failed" ? "error" : undefined;
  const title =
    item.state === "running"
      ? item.summary.endsWith("…") || /ing\b/i.test(item.summary)
        ? item.summary
        : `${item.summary}…`
      : item.state === "failed"
        ? item.summary.startsWith("Failed")
          ? item.summary
          : `Failed: ${item.summary}`
        : item.summary;

  return (
    <Trace>
      <TraceLine status={status}>
        {item.state === "running" ? (
          <>
            <span aria-hidden className="text-foreground">
              <AgentOrb variant="S3" size={14} style={{ color: "currentColor" }} />
            </span>
            <ShimmeringText text={title} className="text-[length:var(--chat-font-size-sm)]" startOnView={false} />
          </>
        ) : (
          <>
            <TraceIcon>
              {item.state === "done" ? <Check /> : item.state === "failed" ? <X /> : <Wrench />}
            </TraceIcon>
            <TraceTitle>{title}</TraceTitle>
          </>
        )}
      </TraceLine>
    </Trace>
  );
}

/** Failure phrased like a normal reply — same type treatment as assistant text. */
function ErrorMessage({ text }: { text: string }) {
  return (
    <div className="flex max-w-full flex-col gap-1.5" role="alert">
      <div className="flex max-w-full flex-col gap-2 text-[length:var(--chat-font-size)] leading-relaxed text-foreground">
        <p className="m-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{humanizeAiError(text)}</p>
      </div>
    </div>
  );
}

function AssistantMessage({ id, text, pending = false }: { id: string; text: string; pending?: boolean }) {
  const phrase = useThinkingPhrase(pending);
  // Hold a shimmer while tokens stream; when ready, words stagger-fade in.
  if (pending) {
    return (
      <div className="flex items-center gap-2" aria-live="polite" aria-busy="true">
        <span aria-hidden className="text-foreground">
          <AgentOrb variant="S2" size={20} style={{ color: "currentColor" }} />
        </span>
        <ShimmeringText key={phrase} text={withEllipsis(phrase)} className="text-[length:var(--chat-font-size-sm)]" startOnView={false} />
      </div>
    );
  }
  const parts = splitFenced(text);
  return (
    <div className="flex max-w-full flex-col gap-1.5">
      <div className="flex max-w-full flex-col gap-2 text-[length:var(--chat-font-size)] leading-relaxed text-foreground">
        {parts.map((part, i) =>
          part.type === "code" ? (
            <CodeBlock key={i} size="sm" className="motion-safe:animate-[fade-in_0.2s_var(--ease-out-strong,ease-out)]">
              <CodeBlockHeader>
                <CodeBlockTitle>{part.lang || "Code"}</CodeBlockTitle>
                <CodeBlockActions>
                  <CodeBlockCopyButton value={part.code} />
                </CodeBlockActions>
              </CodeBlockHeader>
              <CodeBlockContent wrap className="code-hl max-h-64">
                <code dangerouslySetInnerHTML={{ __html: highlight(part.code, `x.${part.lang.toLowerCase()}`) }} />
              </CodeBlockContent>
            </CodeBlock>
          ) : (
            <ChatMarkdown key={i} text={part.text} />
          ),
        )}
      </div>
      <ReplyActions id={id} text={text} />
    </div>
  );
}

/** Copy, rate, and remember. Ratings and memory stay on this computer; memory is shown to the model on later turns. */
function ReplyActions({ id, text }: { id: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const vote = useSyncExternalStore(subscribeMemory, () => getVote(id));
  const remembered = useSyncExternalStore(subscribeMemory, () => isRemembered(id));
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const btn = "size-6 rounded-[6px] p-0 text-muted-foreground hover:text-foreground [&_svg]:size-3";
  const speech = useSpeech();
  const mine = speech.id === id;
  const playing = mine && speech.phase !== "idle";
  const speakErr = mine && speech.phase === "idle" ? speech.error : "";
  const rate = (v: Vote) => setVote(id, v);
  return (
    <div className="flex w-fit items-start gap-0 -ms-1" role="group" aria-label="Reply actions">
      <Button variant="ghost" className={btn} aria-label={copied ? "Copied" : "Copy reply"} title={copied ? "Copied" : "Copy"} onClick={() => void copy()}>
        {copied ? <Check /> : <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />}
      </Button>
      <Button
        variant="ghost"
        className={cn(btn, playing && "text-foreground", speakErr && "text-destructive hover:text-destructive")}
        aria-label={playing ? "Stop reading aloud" : "Read aloud"}
        aria-pressed={playing}
        title={speakErr || (playing ? "Stop" : "Read aloud")}
        onClick={() => (playing ? stopSpeech() : void speakReply(id, text))}
      >
        {speech.phase === "loading" && mine ? <CircleNotch className="animate-spin" /> : playing ? <Stop weight="fill" /> : <SpeakerHigh />}
      </Button>
      <Button variant="ghost" className={cn(btn, vote === "up" && "text-foreground")} aria-label="Good reply" aria-pressed={vote === "up"} title="Good reply" onClick={() => rate("up")}>
        <ThumbsUp strokeWidth={2} className={vote === "up" ? "fill-current" : undefined} />
      </Button>
      <Button variant="ghost" className={cn(btn, vote === "down" && "text-foreground")} aria-label="Bad reply" aria-pressed={vote === "down"} title="Bad reply" onClick={() => rate("down")}>
        <ThumbsDown strokeWidth={2} className={vote === "down" ? "fill-current" : undefined} />
      </Button>
      <Button
        variant="ghost"
        className={cn(btn, remembered && "text-[var(--src-chat)] hover:text-[var(--src-chat)]")}
        aria-label={remembered ? "Forget this reply" : "Remember this reply"}
        aria-pressed={remembered}
        title={remembered ? "Remembered — click to forget" : "Remember this"}
        onClick={() => toggleRemember(id, text)}
      >
        <Brain />
      </Button>
    </div>
  );
}

function splitFenced(text: string): Array<{ type: "text"; text: string } | { type: "code"; lang: string; code: string }> {
  const parts: Array<{ type: "text"; text: string } | { type: "code"; lang: string; code: string }> = [];
  let last = 0;
  for (const match of text.matchAll(FENCE_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      const chunk = text.slice(last, index).trim();
      if (chunk) parts.push({ type: "text", text: chunk });
    }
    parts.push({ type: "code", lang: match[1] || "", code: match[2].replace(/\n$/, "") });
    last = index + match[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) parts.push({ type: "text", text: rest });
  if (!parts.length && text) parts.push({ type: "text", text });
  return parts;
}

function QuestionCard({ item }: { item: Extract<AiChatItem, { kind: "question" }> }) {
  const { question, answer } = item;
  const [text, setText] = useState("");
  const first = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const open = answer === null;

  useEffect(() => {
    if (!open) return;
    const target = first.current ?? textRef.current;
    if (!document.activeElement || document.activeElement === document.body || document.activeElement.closest("[data-home-chat]")) {
      target?.focus({ preventScroll: true });
    }
  }, [open]);

  if (!open) {
    return (
      <div data-home-chat="" className="flex flex-col gap-1.5">
        <p className="text-[length:var(--chat-font-size-sm)] text-muted-foreground">{question.question}</p>
        <p className="m-0 max-w-full text-[length:var(--chat-font-size-sm)] text-foreground">{answer}</p>
      </div>
    );
  }

  return (
    <fieldset data-home-chat="" className="rounded-2xl border-0 bg-muted px-3 py-3">
      <legend className="px-0.5 text-[length:var(--chat-font-size)] font-medium leading-snug text-foreground">{question.question}</legend>
      {question.options.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2">
          {question.options.map((option, i) => (
            <button
              key={option}
              ref={i === 0 ? first : undefined}
              type="button"
              className="rounded-lg border-0 bg-background/55 px-3 py-2 text-left text-[length:var(--chat-font-size-sm)] transition-colors duration-150 hover:bg-background motion-safe:enabled:active:scale-[0.96]"
              onClick={() => answerAi(question.id, option)}
            >
              <span className="me-2 tabular-nums text-muted-foreground">{i + 1}.</span>
              {option}
            </button>
          ))}
        </div>
      )}
      {question.allowText && (
        <form
          className="mt-2.5 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) answerAi(question.id, text.trim());
          }}
        >
          <input
            ref={textRef}
            className="min-h-8 min-w-0 flex-1 rounded-lg border-0 bg-background/55 px-3 py-1.5 text-[length:var(--chat-font-size-sm)] outline-none transition-colors duration-150 focus-visible:bg-background"
            aria-label="Your own answer"
            placeholder={question.options.length ? "Or type your own answer" : "Type your answer"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button size="sm" type="submit" disabled={!text.trim()} className="rounded-[var(--pill)] px-3.5">
            Answer
          </Button>
        </form>
      )}
    </fieldset>
  );
}

function ApprovalCard({ item }: { item: Extract<AiChatItem, { kind: "approval" }> }) {
  const { approval, answer } = item;
  const open = answer === null;

  return (
    <div
      data-home-chat=""
      className={cn("rounded-xl border-0 bg-muted px-3 py-2.5", !open && "opacity-80")}
      role="group"
      aria-label="Permission needed"
    >
      <div className="flex items-center gap-2 text-[length:var(--chat-font-size-sm)] font-medium">
        <ShieldWarning className="size-3.5" aria-hidden />
        {TOOL_LABELS[approval.tool] ?? approval.tool}
      </div>
      {approval.command && (
        <CodeBlock size="sm" className="mt-2">
          <CodeBlockContent wrap>{approval.command}</CodeBlockContent>
        </CodeBlock>
      )}
      <p className="mt-1.5 text-[length:var(--chat-font-size-sm)] text-muted-foreground">{approval.summary}</p>
      {open ? (
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => approveAi(approval.id, false)}>
            Don’t allow
          </Button>
          <Button size="sm" onClick={() => approveAi(approval.id, true)}>
            Allow
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-[length:var(--chat-font-size-sm)] text-muted-foreground">
          {answer === "Allowed" ? "You allowed this." : answer === "Declined" ? "You didn’t allow this." : answer}
        </p>
      )}
    </div>
  );
}

export function HomeAiHint({ className }: { className?: string }) {
  const status = useStore((s) => s.aiStatus);
  if (status?.ready) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      You can start a project now — connect AI later when you want it to build with you.{" "}
      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={openAiSettings}>
        Connect AI
      </button>
    </p>
  );
}
