import { highlight } from "../../lib/highlight";
import { Brain, Check, CircleNotch, Copy, ShieldWarning, ThumbsDown, ThumbsUp, WarningCircle, Wrench, X } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";
import { getVote, isRemembered, setVote, subscribeMemory, toggleRemember, type Vote } from "../../lib/ai-memory";
import { AgentOrb } from "@/components/ui/agent-orb";
import { SOURCE_META, SourceIcon, type SourceKind } from "./SourcesPanel";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  git_commit: "Save a version (commit)",
  git_publish: "Publish to GitHub",
  go_live: "Put the site online",
  import_files: "Import files into the project",
  run_command: "Run a command",
};

const FENCE_RE = /```([\w-]*)\n?([\s\S]*?)```/g;

/** Home conversation thread — grows with content; the parent column scrolls. */
export function HomeChat() {
  const items = useStore((s) => s.aiChat);
  const turnId = useStore((s) => s.aiTurnId);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = !!turnId;
  const waiting = items.some((i) => (i.kind === "question" || i.kind === "approval") && i.answer === null);
  const last = items[items.length - 1];
  const thinking =
    busy && !waiting && !(last?.kind === "assistant" || (last?.kind === "tool" && last.state === "running"));

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [items, thinking]);

  return (
    <div className="w-full px-1 py-2" aria-label="Conversation">
      <div className="flex w-full flex-col gap-4 pb-4">
        {items.map((item) => (
          <div key={item.id} className={item.kind === "user" ? "pb-3" : undefined}>
            <ChatItem item={item} />
          </div>
        ))}
        {thinking && (
          <div className="flex items-center gap-2" aria-live="polite">
            <span aria-hidden className="text-foreground">
              <AgentOrb variant="S1" size={20} style={{ color: "currentColor" }} />
            </span>
            <ShimmeringText text="Thinking…" className="text-[length:var(--chat-font-size-sm)]" startOnView={false} />
          </div>
        )}
        <div ref={endRef} aria-hidden />
      </div>
      <p className="sr-only" role="status">
        {waiting ? "The AI is waiting for your answer." : busy ? "The AI is working." : items.length ? "The AI is done." : ""}
      </p>
    </div>
  );
}

const REF_RE = /\n\nReferenced:\n([\s\S]*)$/;
const REF_LINE = /^- \[(project|chat|file|web|google|skill)\] (.+?) \((.*)\)$/;

/** Splits the references the home prompt appends from what the user actually typed. */
function splitReferences(text: string): { body: string; refs: { kind: SourceKind; title: string }[] } {
  const m = REF_RE.exec(text);
  if (!m) return { body: text, refs: [] };
  const refs = m[1]
    .split("\n")
    .map((line) => REF_LINE.exec(line))
    .filter((x): x is RegExpExecArray => !!x)
    .map((x) => ({ kind: x[1] as SourceKind, title: x[2] }));
  return { body: text.slice(0, m.index), refs };
}

/** Your own message: a boxed bubble on the left, with its references as tags underneath. */
function UserBubble({ text }: { text: string }) {
  const { body, refs } = splitReferences(text);
  return (
    <div className="flex max-w-full flex-col gap-1.5">
      <p className="m-0 w-fit max-w-full break-words rounded-[12px] bg-muted px-4 py-3 text-[length:var(--chat-font-size)] leading-relaxed text-foreground [overflow-wrap:anywhere] whitespace-pre-wrap">{body}</p>
      {refs.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="References">
          {refs.map((r, i) => (
            <li
              key={`${r.kind}:${r.title}:${i}`}
              className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs"
              style={{ color: SOURCE_META[r.kind].color, backgroundColor: `color-mix(in srgb, ${SOURCE_META[r.kind].color} 14%, transparent)` }}
            >
              <SourceIcon kind={r.kind} className="size-3.5" />
              <span className="truncate">{r.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatItem({ item }: { item: AiChatItem }) {
  switch (item.kind) {
    case "user":
      return <UserBubble text={item.text} />;
    case "assistant":
      return <AssistantMessage id={item.id} text={item.text} />;
    case "error":
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[length:var(--chat-font-size-sm)] text-destructive" role="alert">
          <WarningCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{item.text}</span>
        </div>
      );
    case "tool":
      return <ToolTrace item={item} />;
    case "question":
      return <QuestionCard item={item} />;
    case "approval":
      return <ApprovalCard item={item} />;
  }
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
        <TraceIcon>
          {item.state === "running" ? (
            <CircleNotch className="animate-spin" />
          ) : item.state === "done" ? (
            <Check />
          ) : item.state === "failed" ? (
            <X />
          ) : (
            <Wrench />
          )}
        </TraceIcon>
        <TraceTitle>{title}</TraceTitle>
      </TraceLine>
    </Trace>
  );
}

function AssistantMessage({ id, text }: { id: string; text: string }) {
  const parts = splitFenced(text);
  return (
    <div className="flex max-w-full flex-col gap-1.5">
      <div className="flex max-w-full flex-col gap-2 text-[length:var(--chat-font-size)] leading-relaxed text-foreground">
        {parts.map((part, i) =>
          part.type === "code" ? (
            <CodeBlock key={i} size="sm">
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
            <p key={i} className="m-0 whitespace-pre-wrap">
              {part.text}
            </p>
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
  const rate = (v: Vote) => setVote(id, v);
  return (
    <div className="flex items-center gap-0.5 -ms-2" role="group" aria-label="Reply actions">
      <Button variant="ghost" className={btn} aria-label={copied ? "Copied" : "Copy reply"} title={copied ? "Copied" : "Copy"} onClick={() => void copy()}>
        {copied ? <Check /> : <Copy />}
      </Button>
      <Button variant="ghost" className={cn(btn, vote === "up" && "text-foreground")} aria-label="Good reply" aria-pressed={vote === "up"} title="Good reply" onClick={() => rate("up")}>
        <ThumbsUp className={vote === "up" ? "fill-current" : undefined} />
      </Button>
      <Button variant="ghost" className={cn(btn, vote === "down" && "text-foreground")} aria-label="Bad reply" aria-pressed={vote === "down"} title="Bad reply" onClick={() => rate("down")}>
        <ThumbsDown className={vote === "down" ? "fill-current" : undefined} />
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
  if (status?.ready || !status?.reason) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {status.reason}{" "}
      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={openAiSettings}>
        Open Settings
      </button>
    </p>
  );
}
