import { getSendKey } from "../../lib/prefs";
import { FolderOpen, Stop, Waveform } from '../../lib/home-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowUp02Icon, AttachmentIcon, Cancel01Icon, CommandLineIcon, File01Icon, Globe02Icon, Mic01Icon } from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { stopAi } from "../../lib/ai";
import { measurementStyle, splitMeasurements } from "../../lib/measure-units";
import { browserSpeechAvailable, listenOnceBrowser, listenWithProvider, micCaptureAvailable } from "../../lib/voice";
import { SOURCE_META, SourceIcon, type SourceKind } from "./SourcesPanel";
import { dynamicPillRadius } from "../../lib/pill-radius";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
export interface Attachment {
  id: string;
  name: string;
  size: number;
  /** File contents for text and code; empty for images. */
  text: string;
  /** Set for images: base64 payload (no data: prefix) sent with the message, shown as a thumbnail. */
  image?: { mimeType: string; data: string };
}

const CMD_PREFIX = "cmd:";
export const isCommand = (o: { id: string }) => o.id.startsWith(CMD_PREFIX);

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);

export interface MentionOption {
  id: string;
  label: string;
  detail: string;
  kind: SourceKind;
}

/** `corner-shape` isn't in the CSS typings yet; browsers without it fall back to a plain rounded corner. */
const SQUIRCLE = { cornerShape: "squircle" } as React.CSSProperties;

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
  commands = [],
  onCommand,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  history = [],
  webSearch = true,
  onWebSearch,
  minLines = 1,
  deck = false,
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
  /** Built-in actions the `/` menu lists above skills. Picking one calls `onCommand` with its id. */
  commands?: MentionOption[];
  onCommand?: (id: string) => void;
  /** Files shown as chips above the input. */
  attachments?: Attachment[];
  onAttach?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  /** Earlier messages, newest first, for the Up arrow to walk back through. */
  history?: string[];
  /** Icon toggle beside the attach button: whether the AI may search the web for this message. */
  webSearch?: boolean;
  onWebSearch?: (on: boolean) => void;
  /** Lines of text the in-conversation field holds before it grows. */
  minLines?: number;
  /**
   * Home start state. The empty card is 72px with the controls inside it.
   * The text sits above that row and grows with the card. The shell is a 20px squircle.
   */
  deck?: boolean;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const lineCount = Math.max(1, minLines);
  /** One line is leading-6 plus the field's vertical padding; extra lines add another leading-6. */
  const minTextHeight = `calc(${lineCount} * 1.5rem + 1.25rem)`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(44);
  const [radius, setRadius] = useState("var(--r-pill)");
  const hasText = !!value.trim() || attachments.length > 0;
  const fileRef = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);
  const [focused, setFocused] = useState(false);
  const dictation = useRef<AbortController | null>(null);
  const canDictate = browserSpeechAvailable() || micCaptureAvailable();
  const valueRef = useRef(value);
  valueRef.current = value;
  const stopDictation = useCallback(() => dictation.current?.abort(), []);
  useEffect(() => () => dictation.current?.abort(), []);
  const dictate = useCallback(async () => {
    if (dictation.current) return stopDictation();
    const ac = new AbortController();
    dictation.current = ac;
    setListening(true);
    try {
      const heard = (await (browserSpeechAvailable() ? listenOnceBrowser({ signal: ac.signal }) : listenWithProvider(ac.signal))).trim();
      if (heard && !ac.signal.aborted) {
        const cur = valueRef.current;
        onChange(cur && !/\s$/.test(cur) ? `${cur} ${heard}` : cur + heard);
        textareaRef.current?.focus();
      }
    } catch {
      /* stopped, denied or nothing heard: leave the text as it was */
    } finally {
      dictation.current = null;
      setListening(false);
    }
  }, [onChange, stopDictation]);
  const [dragging, setDragging] = useState(false);
  const histAt = useRef(-1);
  const histDraft = useRef("");
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
    if (symbol === "/")
      return [
        ...commands.filter((m) => m.label.toLowerCase().includes(query)),
        ...skills.filter((m) => m.label.toLowerCase().includes(query)).slice(0, 7),
        ...(onOpenSkills ? [FOLDER_ROW] : []),
      ];
    return mentions.filter((m) => m.label.toLowerCase().includes(query)).slice(0, 8);
  }, [mentions, skills, commands, onOpenSkills, query, symbol]);
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
      out.push(...splitMeasurements(part.text));
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
    if (isCommand(option)) {
      onChange(`${value.slice(0, triggerStart)}${value.slice(caret)}`);
      onCommand?.(option.id.slice(CMD_PREFIX.length));
      return;
    }
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
    if (deck) return;
    const el = shellRef.current;
    if (!el) return;
    const measure = () => setRadius(dynamicPillRadius(el.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [deck, value, textareaHeight]);

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
    // Up/Down walk earlier messages, but only from an empty box or the very start/end, so editing a long draft still moves the caret.
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && history.length) {
      const el = e.currentTarget;
      const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
      const atEnd = el.selectionStart === value.length && el.selectionEnd === value.length;
      const browsing = histAt.current >= 0;
      if (e.key === "ArrowUp" && (!value || (browsing && atStart) || (!browsing && atStart))) {
        if (histAt.current + 1 < history.length) {
          e.preventDefault();
          if (!browsing) histDraft.current = value;
          histAt.current += 1;
          onChange(history[histAt.current]);
          requestAnimationFrame(() => el.setSelectionRange(0, 0));
        }
        return;
      }
      if (e.key === "ArrowDown" && browsing && atEnd) {
        e.preventDefault();
        histAt.current -= 1;
        const next = histAt.current < 0 ? histDraft.current : history[histAt.current];
        onChange(next);
        requestAnimationFrame(() => el.setSelectionRange(next.length, next.length));
        return;
      }
    }
    if (e.key === "Escape" && listening) {
      e.preventDefault();
      stopDictation();
      return;
    }
    if (e.key === "Escape" && sending) {
      e.preventDefault();
      stopAi();
      return;
    }
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    // "Ctrl+Enter to send" leaves a plain Enter as a new line.
    if (getSendKey() === "mod-enter" && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (hasText && !disabled && !sending) submit();
  };

  const submit = () => {
    histAt.current = -1;
    histDraft.current = "";
    onSubmit();
  };

  /** Inline composer centers a one-line field and pins the controls once it wraps. */
  const inlineControls = textareaHeight > 44 ? "self-end" : "self-center";
  const attachButton = (
    <InputGroupButton variant="ghost" size="icon" className="rounded-[var(--pill)] text-muted-foreground" aria-label="Attach files" onClick={() => fileRef.current?.click()}>
      <HugeiconsIcon icon={AttachmentIcon} size={18} strokeWidth={1.8} aria-hidden />
    </InputGroupButton>
  );
  const webButton = onWebSearch ? (
    <InputGroupButton
      variant="ghost"
      size="icon"
      className={`rounded-[var(--pill)] ${webSearch ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground"}`}
      aria-label="Web search"
      aria-pressed={webSearch}
      title={webSearch ? "Web search is on" : "Web search is off"}
      onClick={() => onWebSearch(!webSearch)}
    >
      <HugeiconsIcon icon={Globe02Icon} size={18} strokeWidth={1.8} aria-hidden />
    </InputGroupButton>
  ) : null;
  const micButton =
    canDictate && !sending && (focused || listening) ? (
      <InputGroupButton
        variant="ghost"
        size="icon"
        className={`me-1 rounded-[var(--pill)] ${listening ? "bg-red-500/15 text-red-600 animate-pulse" : "text-muted-foreground"}`}
        aria-label={listening ? "Stop dictation" : "Dictate"}
        aria-pressed={listening}
        disabled={disabled}
        onClick={() => void dictate()}
      >
        <HugeiconsIcon icon={Mic01Icon} size={18} strokeWidth={1.8} aria-hidden />
      </InputGroupButton>
    ) : null;
  const trailingButton = sending ? (
    <InputGroupButton variant="default" size="icon" className="rounded-[var(--pill)]" aria-label="Stop" onClick={stopAi}>
      <Stop weight="fill" className="size-3.5" />
    </InputGroupButton>
  ) : hasText ? (
    <InputGroupButton variant="default" size="icon" className="rounded-[var(--pill)]" aria-label="Send" disabled={disabled} onClick={submit}>
      <HugeiconsIcon icon={ArrowUp02Icon} size={16} strokeWidth={2} aria-hidden />
    </InputGroupButton>
  ) : (
    <InputGroupButton variant="default" size="icon" className="rounded-[var(--pill)]" aria-label="Voice input" disabled={disabled || !onVoice} onClick={onVoice}>
      <Waveform />
    </InputGroupButton>
  );

  const takeFiles = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = Array.from(list ?? []);
      if (files.length) onAttach?.(files);
    },
    [onAttach],
  );

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
              {m.id === SKILLS_FOLDER ? (
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : isCommand(m) ? (
                <HugeiconsIcon icon={CommandLineIcon} size={16} strokeWidth={1.8} className="shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <SourceIcon kind={m.kind} className="size-4" />
              )}
              <strong className={`min-w-0 truncate text-sm font-medium ${m.id === SKILLS_FOLDER ? "text-muted-foreground" : ""}`}>{m.label}</strong>
              <span className="ms-auto min-w-0 max-w-[45%] truncate text-xs text-muted-foreground">{m.detail}</span>
            </li>
          ))}
        </ul>
      )}
    <div
      ref={shellRef}
      data-home-composer-front={deck ? "" : undefined}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className={`w-full overflow-hidden ${deck ? "flex flex-col" : "bg-muted/70 backdrop-blur-[30px] backdrop-saturate-150 transition-[background-color,box-shadow] duration-150 focus-within:bg-secondary/70"} ${dragging ? "bg-secondary/80 shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--fg,#111)_28%,transparent)]" : ""}`}
      style={deck ? { minHeight: 96, borderRadius: 24, ...SQUIRCLE } : { borderRadius: radius }}
      onDragOver={(e) => {
        if (!onAttach || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!onAttach || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        takeFiles(e.dataTransfer.files);
      }}
    >
      {attachments.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 px-3 pb-0 pt-2.5" aria-label="Attachments">
          {attachments.map((a) => (
            <li key={a.id} className="flex max-w-[220px] items-center gap-1.5 rounded-[var(--pill)] bg-foreground/[0.07] py-1 pe-1 ps-2.5 text-xs">
              {a.image ? (
                <img src={`data:${a.image.mimeType};base64,${a.image.data}`} alt="" className="size-4 shrink-0 rounded-[4px] object-cover" />
              ) : (
                <HugeiconsIcon icon={File01Icon} size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 truncate font-medium">{a.name}</span>
              <span className="shrink-0 text-muted-foreground">{fmtSize(a.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onRemoveAttachment?.(a.id)}
                className="grid size-5 shrink-0 place-items-center rounded-[var(--pill)] border-0 bg-transparent text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <InputGroup className={deck ? "h-auto flex-1 flex-col items-stretch gap-0 border-0 bg-transparent p-0 shadow-none has-[[data-slot=input-group-control]:focus-visible]:bg-transparent" : "h-auto border-0 bg-transparent pe-2 py-1 shadow-none has-[[data-slot=input-group-control]:focus-visible]:bg-transparent"}>
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                takeFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {!deck && (
              <InputGroupAddon align="inline-start" className={`${inlineControls} ps-3 pb-0`}>
                <div className="flex items-center gap-0.5">
                  {attachButton}
                  {webButton}
                </div>
              </InputGroupAddon>
            )}
          </>
        )}
        <div className={deck ? "relative w-full flex-1" : "relative min-w-0 flex-1"}>
        <div
          ref={overlayRef}
          aria-hidden
          className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-base leading-6 text-foreground ${deck ? "px-4 pb-0.5 pt-3.5" : "px-4 py-2.5"}`}
        >
          {parts.map((part, i) => (
            <span
              key={i}
              style={
                part.kind
                  ? { color: SOURCE_META[part.kind].color }
                  : part.unit
                    ? measurementStyle(part.unit)
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
          rows={deck ? 1 : lineCount}
          style={deck ? { minHeight: 0, padding: "14px 16px 2px" } : { minHeight: minTextHeight }}
          data-home-prompt=""
          aria-label="Message the AI"
          placeholder="Message…"
          className={`field-sizing-content relative max-h-60 text-transparent caret-foreground w-full bg-transparent leading-6 focus-visible:bg-transparent ${deck ? "min-h-0" : "min-h-11 px-4 py-2.5"}`}
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
          onPaste={(e) => {
            if (onAttach && e.clipboardData.files.length) {
              e.preventDefault();
              takeFiles(e.clipboardData.files);
            }
          }}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
        />
        </div>
        {!deck && (
          <InputGroupAddon align="inline-end" className={`${inlineControls} pe-0 pb-0 has-[>button]:me-0`}>
            {micButton}
            {trailingButton}
          </InputGroupAddon>
        )}
      </InputGroup>
      {deck && (
        <div data-home-composer-toolbar="" className="flex w-full shrink-0 items-center justify-between" style={{ padding: "4px 10px 10px" }}>
          <div className="flex items-center gap-0.5">
            {onAttach ? attachButton : null}
            {webButton}
          </div>
          <div className="flex items-center">
            {micButton}
            {trailingButton}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
