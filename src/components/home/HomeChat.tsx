import { Check, CircleAlert, Loader2, ShieldQuestion, Wrench, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";
import { dynamicPillRadius } from "../../lib/pill-radius";
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
          <ChatItem key={item.id} item={item} />
        ))}
        {thinking && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Thinking…
          </p>
        )}
        <div ref={endRef} aria-hidden />
      </div>
      <p className="sr-only" role="status">
        {waiting ? "The AI is waiting for your answer." : busy ? "The AI is working." : items.length ? "The AI is done." : ""}
      </p>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState("var(--r-pill)");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setRadius(dynamicPillRadius(el.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div
      ref={ref}
      className="ml-auto max-w-[min(85%,28rem)] break-words bg-[var(--chat-user-bg)] px-3 py-1 text-sm leading-relaxed text-[var(--chat-user-fg)] [overflow-wrap:anywhere] whitespace-pre-wrap"
      style={{ borderRadius: radius }}
    >
      {text}
    </div>
  );
}

function ChatItem({ item }: { item: AiChatItem }) {
  switch (item.kind) {
    case "user":
      return <UserBubble text={item.text} />;
    case "assistant":
      return <AssistantMessage text={item.text} />;
    case "error":
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
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
            <Loader2 className="animate-spin" />
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

function AssistantMessage({ text }: { text: string }) {
  const parts = splitFenced(text);
  return (
    <div className="flex max-w-[95%] flex-col gap-2 text-sm leading-relaxed text-foreground">
      {parts.map((part, i) =>
        part.type === "code" ? (
          <CodeBlock key={i} size="sm">
            <CodeBlockHeader>
              <CodeBlockTitle>{part.lang || "Code"}</CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton value={part.code} />
              </CodeBlockActions>
            </CodeBlockHeader>
            <CodeBlockContent wrap className="max-h-64">
              {part.code}
            </CodeBlockContent>
          </CodeBlock>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {part.text}
          </p>
        ),
      )}
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
        <p className="text-sm text-muted-foreground">{question.question}</p>
        <div className="ml-auto max-w-[85%] rounded-[var(--r-lg)] bg-muted px-3 py-1.5 text-sm text-foreground">{answer}</div>
      </div>
    );
  }

  return (
    <fieldset data-home-chat="" className="rounded-2xl border-0 bg-muted px-3 py-3">
      <legend className="px-0.5 text-sm font-medium leading-snug text-foreground">{question.question}</legend>
      {question.options.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2">
          {question.options.map((option, i) => (
            <button
              key={option}
              ref={i === 0 ? first : undefined}
              type="button"
              className="rounded-lg border-0 bg-background/55 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-background motion-safe:enabled:active:scale-[0.96]"
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
            className="min-h-8 min-w-0 flex-1 rounded-lg border-0 bg-background/55 px-3 py-1.5 text-sm outline-none transition-colors duration-150 focus-visible:bg-background"
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
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldQuestion className="size-3.5" aria-hidden />
        {TOOL_LABELS[approval.tool] ?? approval.tool}
      </div>
      {approval.command && (
        <CodeBlock size="sm" className="mt-2">
          <CodeBlockContent wrap>{approval.command}</CodeBlockContent>
        </CodeBlock>
      )}
      <p className="mt-1.5 text-sm text-muted-foreground">{approval.summary}</p>
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
        <p className="mt-1 text-sm text-muted-foreground">
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
