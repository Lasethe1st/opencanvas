import { ArrowUp, FolderOpen, Stop, Waveform } from "@phosphor-icons/react";
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

/** A number followed by a CSS unit, standing on its own (not inside a word, a hex colour or an identifier). */
const UNIT_RE = /(?<![\w.#-])(-?\d*\.?\d+)(px|rem|em|%|vh|vw|vmin|vmax|svh|dvh|lvh|pt|pc|cm|mm|in|ch|ex|lh|fr|deg|rad|turn|ms|s)(?![\w%])/g;

/** `corner-shape` isn't in the CSS typings yet; browsers without it fall back to a plain rounded corner. */
const SQUIRCLE = { cornerShape: "squircle" } as React.CSSProperties;

const UNIT_COLORS = {
  absolute: "var(--src-project)",
  font: "var(--src-web)",
  percent: "var(--src-file)",
  viewport: "var(--src-chat)",
  other: "var(--src-google)",
} as const;

function unitFamily(unit: string): keyof typeof UNIT_COLORS {
  if (["px", "pt", "pc", "cm", "mm", "in"].includes(unit)) return "absolute";
  if (["rem", "em", "ch", "ex", "lh"].includes(unit)) return "font";
  if (unit === "%") return "percent";
  if (["vh", "vw", "vmin", "vmax", "svh", "dvh", "lvh"].includes(unit)) return "viewport";
  return "other";
}

const SKILLS_FOLDER = "__skills-folder";
const FOLDER_ROW: MentionOption = { id: SKILLS_FOLDER, label: "Open skills folder", detail: "", kind: "skill" };

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
  skills = [],
  onOpenSkills,
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
  /** Skills that `/` can call. */
  skills?: MentionOption[];
  /** Opens the folder skills are kept in. */
  onOpenSkills?: () => void;
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

  // An `@` (references) or `/` (skills) at the start of a word, up to the caret, opens the picker.
  const trigger = /(^|\s)([@/])([^\s@/]*)$/.exec(value.slice(0, caret));
  const symbol = trigger ? trigger[2] : null;
  const query = trigger ? trigger[3].toLowerCase() : null;
  const triggerStart = trigger ? caret - trigger[3].length - 1 : -1;
  const matches = useMemo(() => {
    if (query === null) return [];
    if (symbol === "/") return [...skills.filter((m) => m.label.toLowerCase().includes(query)).slice(0, 7), ...(onOpenSkills ? [FOLDER_ROW] : [])];
    return mentions.filter((m) => m.label.toLowerCase().includes(query)).slice(0, 8);
  }, [mentions, skills, onOpenSkills, query, symbol]);
  const open = query !== null && matches.length > 0 && dismissed !== triggerStart && !!onMention;

  useEffect(() => setActive(0), [query]);

  // Picked references read as coloured words inside the text. The textarea's own text is invisible and
  // everything is drawn on a layer behind it, so only the names that were picked get their kind's colour.
  const overlayRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Map<string, SourceKind>>(() => new Map());
  useEffect(() => {
    if (!value && picked.size) setPicked(new Map());
  }, [value, picked.size]);
  const parts = useMemo(() => {
    const labels = [...picked.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
    const named: { text: string; kind?: SourceKind }[] = [];
    if (!labels.length) named.push({ text: value });
    else {
      const re = new RegExp(`(^|\\s)(${labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=[\\s,.;:!?)]|$)`, "g");
      let last = 0;
      for (const m of value.matchAll(re)) {
        const start = (m.index ?? 0) + m[1].length;
        if (start > last) named.push({ text: value.slice(last, start) });
        named.push({ text: m[2], kind: picked.get(m[2]) });
        last = start + m[2].length;
      }
      if (last < value.length) named.push({ text: value.slice(last) });
    }
    // CSS measurements typed in plain text (16px, 1.5rem, 50%) get a tinted box of their own.
    const out: { text: string; kind?: SourceKind; unit?: string }[] = [];
    for (const part of named) {
      if (part.kind) {
        out.push(part);
        continue;
      }
      let last = 0;
      for (const m of part.text.matchAll(UNIT_RE)) {
        const start = m.index ?? 0;
        if (start > last) out.push({ text: part.text.slice(last, start) });
        out.push({ text: m[0], unit: UNIT_COLORS[unitFamily(m[2])] });
        last = start + m[0].length;
      }
      if (last < part.text.length) out.push({ text: part.text.slice(last) });
    }
    return out;
  }, [picked, value]);

  /** Where each picked name sits in the text, so Backspace and Delete can remove one as a whole. */
  const ranges = useMemo(() => {
    const out: { start: number; end: number }[] = [];
    let at = 0;
    for (const part of parts) {
      if (part.kind) out.push({ start: at, end: at + part.text.length });
      at += part.text.length;
    }
    return out;
  }, [parts]);

  const removeWholeName = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return false;
    const at = el.selectionStart;
    const hit = ranges.find((r) => (e.key === "Backspace" ? at > r.start && at <= r.end : at >= r.start && at < r.end));
    if (!hit) return false;
    e.preventDefault();
    onChange(value.slice(0, hit.start) + value.slice(hit.end));
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(hit.start, hit.start);
      setCaret(hit.start);
    });
    return true;
  };

  const pick = (option: MentionOption) => {
    if (option.id === SKILLS_FOLDER) {
      const next = `${value.slice(0, triggerStart)}${value.slice(caret)}`;
      onChange(next);
      onOpenSkills?.();
      return;
    }
    const next = `${value.slice(0, triggerStart)}${option.label} ${value.slice(caret)}`;
    const pos = triggerStart + option.label.length + 1;
    setPicked((cur) => new Map(cur).set(option.label, option.kind));
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
    if ((e.key === "Backspace" || e.key === "Delete") && !e.nativeEvent.isComposing && removeWholeName(e)) return;
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
          aria-label={symbol === "/" ? "Skills" : "Reference"}
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
              {m.id === SKILLS_FOLDER ? <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <SourceIcon kind={m.kind} className="size-4" />}
              <strong className={`min-w-0 truncate text-sm font-medium ${m.id === SKILLS_FOLDER ? "text-muted-foreground" : ""}`}>{m.label}</strong>
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
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-4 py-2.5 text-base leading-6 text-foreground"
        >
          {parts.map((part, i) => (
            <span
              key={i}
              style={
                part.kind
                  ? { color: SOURCE_META[part.kind].color }
                  : part.unit
                    ? {
                        color: part.unit,
                        backgroundColor: `color-mix(in srgb, ${part.unit} 16%, transparent)`,
                        borderRadius: 6,
                        padding: "0 2px",
                        margin: "0 -2px",
                        ...SQUIRCLE,
                      }
                    : undefined
              }
            >
              {part.text}
            </span>
          ))}
          {value.endsWith("\n") ? "\u200b" : null}
        </div>
        <InputGroupTextarea
          ref={textareaRef}
          autoFocus
          rows={1}
          data-home-prompt=""
          aria-label="Message the AI"
          placeholder="Message…"
          className="field-sizing-content relative max-h-60 text-transparent caret-foreground min-h-11 w-full bg-transparent px-4 py-2.5 leading-6 focus-visible:bg-transparent"
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
              <Stop className="size-3.5 fill-current" />
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
              <ArrowUp />
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
              <Waveform />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
    </div>
  );
}
