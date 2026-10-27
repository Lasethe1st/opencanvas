import { ArrowUp, AudioLines, Square } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { stopAi } from "../../lib/ai";
import { SOURCE_META, SourceIcon, type SourceKind } from "./SourcesPanel";
import { dynamicPillRadius } from "../../lib/pill-radius";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
export interface MentionOption {
  id: string;
  label: string;
  detail: string;
  kind: SourceKind;
}

/** The large home composer. Enter sends to AI, Shift+Enter adds a line. */
export function HomePrompt({
  value,
  onChange,
  onSubmit,
  onVoice,
  disabled,
  sending,
  mentions = [],
  onMention,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Empty-state control — opens the voice orb session. */
  onVoice?: () => void;
  disabled?: boolean;
  sending?: boolean;
  /** Things `@` can reference. */
  mentions?: MentionOption[];
  onMention?: (option: MentionOption) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(44);
  const [radius, setRadius] = useState("var(--r-pill)");
  const hasText = !!value.trim();
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);

  // An `@` at the start of a word, up to the caret, opens the picker.
  const trigger = /(^|\s)@([^\s@]*)$/.exec(value.slice(0, caret));
  const query = trigger ? trigger[2].toLowerCase() : null;
  const triggerStart = trigger ? caret - trigger[2].length - 1 : -1;
  const matches = useMemo(
    () => (query === null ? [] : mentions.filter((m) => m.label.toLowerCase().includes(query)).slice(0, 8)),
    [mentions, query],
  );
  const open = query !== null && matches.length > 0 && dismissed !== triggerStart && !!onMention;

  useEffect(() => setActive(0), [query]);

  // Picked references show as chips inside the text: a highlight drawn behind the matching `@name`.
  const overlayRef = useRef<HTMLDivElement>(null);
  const parts = useMemo(() => {
    const labels = [...new Set(mentions.map((m) => m.label))].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!labels.length || !value.includes("@")) return [{ text: value, hit: false }];
    const re = new RegExp(`(^|\\s)@(${labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=\\s|$)`, "g");
    const out: { text: string; hit: boolean; kind?: SourceKind }[] = [];
    const kindOf = new Map(mentions.map((m) => [m.label, m.kind] as const));
    let last = 0;
    for (const m of value.matchAll(re)) {
      const start = (m.index ?? 0) + m[1].length;
      if (start > last) out.push({ text: value.slice(last, start), hit: false });
      out.push({ text: `@${m[2]}`, hit: true, kind: kindOf.get(m[2]) });
      last = start + m[2].length + 1;
    }
    if (last < value.length) out.push({ text: value.slice(last), hit: false });
    return out;
  }, [mentions, value]);

  const pick = (option: MentionOption) => {
    const next = `${value.slice(0, triggerStart)}@${option.label} ${value.slice(caret)}`;
    const pos = triggerStart + option.label.length + 2;
    onChange(next);
    onMention?.(option);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const observer = new ResizeObserver(([entry]) => {
      setTextareaHeight(entry.contentRect.height);
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => setRadius(dynamicPillRadius(el.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, textareaHeight]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        pick(matches[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(triggerStart);
        return;
      }
    }
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (hasText && !disabled && !sending) onSubmit();
  };

  return (
    <div className="relative w-full">
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Reference"
          className="absolute inset-x-0 bottom-full z-30 m-0 mb-2 flex max-h-64 list-none flex-col gap-px overflow-y-auto overscroll-contain rounded-[12px] border border-foreground/[0.08] bg-[var(--home-card)] p-1.5 motion-safe:animate-[fade-in_0.12s_ease-out]"
        >
          {matches.map((m, i) => (
            <li
              key={m.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-1.5 ${i === active ? "bg-accent" : ""}`}
            >
              <SourceIcon kind={m.kind} className="size-5 self-center" />
              <strong className="min-w-0 truncate text-sm font-medium">{m.label}</strong>
              <span className="ms-auto min-w-0 max-w-[45%] truncate text-xs text-muted-foreground">{m.detail}</span>
            </li>
          ))}
        </ul>
      )}
    <div
      ref={shellRef}
      className="w-full overflow-hidden bg-muted/70 backdrop-blur-[30px] backdrop-saturate-150 transition-[background-color] duration-150 focus-within:bg-secondary/70"
      style={{ borderRadius: radius }}
    >
      <InputGroup className="h-auto border-0 bg-transparent pe-2 py-1 shadow-none has-[[data-slot=input-group-control]:focus-visible]:bg-transparent">
        <div className="relative min-w-0 flex-1">
        <div
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-4 py-2.5 text-base leading-6 text-transparent"
        >
          {parts.map((part, i) =>
            part.hit ? (
              <mark key={i} className="rounded-[6px] text-transparent" style={{ backgroundColor: `color-mix(in srgb, ${SOURCE_META[part.kind ?? "file"].color} 20%, transparent)` }}>
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
          {value.endsWith("\n") ? "\u200b" : null}
        </div>
        <InputGroupTextarea
          ref={textareaRef}
          autoFocus
          rows={1}
          data-home-prompt=""
          aria-label="Message the AI"
          placeholder="Message…"
          className="field-sizing-content relative max-h-60 min-h-11 w-full bg-transparent px-4 py-2.5 leading-6 focus-visible:bg-transparent"
          onScroll={(e) => {
            if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          value={value}
          disabled={disabled && !sending}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
        />
        </div>
        <InputGroupAddon
          align="inline-end"
          className={`${textareaHeight <= 44 ? "self-center" : "self-end"} pe-0 pb-0 has-[>button]:me-0`}
        >
          {sending ? (
            <InputGroupButton variant="default" size="icon" className="rounded-[var(--pill)]" aria-label="Stop" onClick={stopAi}>
              <Square className="size-3.5 fill-current" strokeWidth={2} />
            </InputGroupButton>
          ) : hasText ? (
            <InputGroupButton
              variant="default"
              size="icon"
              className="rounded-[var(--pill)]"
              aria-label="Send"
              disabled={disabled}
              onClick={onSubmit}
            >
              <ArrowUp strokeWidth={2} />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              variant="default"
              size="icon"
              className="rounded-[var(--pill)]"
              aria-label="Voice input"
              disabled={disabled || !onVoice}
              onClick={onVoice}
            >
              <AudioLines strokeWidth={2} />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
    </div>
  );
}
