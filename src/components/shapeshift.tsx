"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { type ReactNode, type Ref, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Shapeshift: an input that becomes what you mean. You give it shapes, each one a component of yours with the
// words it answers to and a reader that pulls its data out of a sentence. As someone types, the field works out
// which shape is meant, reads the sentence into that shape's data and opens your component, already filled in.
//
//   const split = shape({
//     id: "split",
//     label: "Split a bill",
//     example: "split 2400 between 3",
//     match: ["split", "divide"],
//     read: (text) => readSplit(text),               // { total: 2400, people: 3 }, or null
//     render: ({ data }) => <SplitCard {...data} />, // your component, filled in
//   });
//
//   <Shapeshift shapes={[split, timer, event]} onSubmit={({ shape, data }) => save(shape, data)} />

/* ---------- shapes ---------- */

/** What a shape's component is handed. */
export type ShapeProps<T> = {
  /** What `read` found in the sentence. */
  data: T;
  /** The sentence itself. */
  text: string;
  /** Rewrite the sentence. The shape reads it again. */
  setText: (text: string) => void;
  /**
   * The same as pressing Enter: hands the reading to `onSubmit`, then clears the field. Pass your own data to hand
   * that over instead. If your component is a `<form>`, Enter and the field's button submit that form, so call
   * `submit(values)` from its `onSubmit`.
   */
  submit: (data?: T) => void;
  /** Put the shape away and clear the field. */
  close: () => void;
};

/**
 * One thing a sentence can mean: a word (or a phrase), a pattern, or a function that returns true, false or how
 * sure it is from 0 to 1. Words are whole words, in any case; patterns test the sentence as typed, so give them /i.
 */
export type ShapeMatch = string | RegExp | ((text: string) => boolean | number);

export type ShapeConfig<T> = {
  /** A name of your own for it. Comes back in `onSubmit`. */
  id: string;
  /** What it's called, in the list and over the open component. */
  label: string;
  /** One line about it, under its label in the list. */
  hint?: string;
  /** A sentence that opens it. Typed in when it's picked from the list, and shown in the empty field. */
  example?: string;
  icon?: ReactNode;
  /** What it answers to. With no `read`, a match alone opens it. */
  match?: ShapeMatch | ShapeMatch[];
  /** Pulls the shape's data out of the sentence, or returns null when it isn't there yet. */
  read?: (text: string) => T | null | undefined;
  /** Your component, given the data. */
  render: (props: ShapeProps<T>) => ReactNode;
  /** Enter, or `submit()` from your component, with this shape open. */
  onSubmit?: (data: T, text: string) => void;
  /** What Enter does, on the button in the field: "Add event". The button shows whenever something takes the reading. */
  action?: string;
  /** Leave out the icon and label, and show only your component. */
  bare?: boolean;
};

/** A shape with its data type put away, so shapes of every kind sit in one list. */
export type Shape = ShapeConfig<unknown>;

/** Makes a shape. The data's type runs from `read` into `render` and `onSubmit`. */
export function shape<T = undefined>(config: ShapeConfig<T>): Shape {
  return config as unknown as Shape;
}

/* ---------- reading a sentence ---------- */

const tidy = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const WORD = /^[\p{L}\p{N}]+$/u;

/** How well a sentence answers a `match`: 1 when a word, phrase or pattern is there, 0.5 while its first word is being typed. */
function matchScore(match: Shape["match"], sentence: string) {
  if (match === undefined) return 0;
  const lower = tidy(sentence);
  const words = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // A word still being typed counts only while it's the only one: that's someone looking through the list by name.
  // Mid-sentence, half a word says nothing ("minecraft di" isn't a dinner).
  const typing = words.length === 1 && /[\p{L}\p{N}]$/u.test(sentence) ? words[0] : "";
  let best = 0;
  for (const one of Array.isArray(match) ? match : [match]) {
    if (typeof one === "function") {
      const answer = one(sentence);
      best = Math.max(best, answer === true ? 1 : answer === false ? 0 : Math.min(1, Math.max(0, answer)));
    } else if (one instanceof RegExp) {
      // a /g pattern remembers where it stopped: start it from the top, and leave it there for whoever uses it next
      one.lastIndex = 0;
      if (one.test(sentence)) best = 1;
      one.lastIndex = 0;
    } else {
      const word = tidy(one);
      if (!word) continue;
      if (WORD.test(word) ? words.includes(word) : lower.includes(word)) best = 1;
      else if (typing.length >= 2 && word.startsWith(typing)) best = Math.max(best, 0.5);
    }
  }
  return best;
}

/** A shape's own name counts too: typed whole it's a match, and its beginning is enough to list it. */
function labelScore(label: string, sentence: string) {
  const name = tidy(label);
  const typed = tidy(sentence);
  if (name === typed) return 1;
  return typed.length >= 2 && (name.startsWith(typed) || name.split(" ").some((word) => word.startsWith(typed))) ? 0.5 : 0;
}

type Reading = {
  shape: Shape;
  /** 0 to 1: how well the sentence answers the shape's words. */
  hit: number;
  /** Whether `read` found its data, and the data. */
  found: boolean;
  data: unknown;
  /** Everything the shape asks for is in the sentence, so it can open by itself. */
  sure: boolean;
  score: number;
};

function readAll(shapes: readonly Shape[], text: string): Reading[] {
  const sentence = text.trim();
  if (!sentence) return [];
  return shapes.map((shape) => {
    const hit = Math.max(matchScore(shape.match, sentence), labelScore(shape.label, sentence));
    let data: unknown;
    if (shape.read) {
      try {
        data = shape.read(sentence) ?? undefined;
      } catch {
        data = undefined;
      }
    }
    const found = data !== undefined;
    const sure = shape.read ? found && (shape.match === undefined || hit >= 1) : hit >= 1;
    // A shape with words of its own is only offered once one of them shows up, however much its reader can find.
    const offered = shape.match === undefined || hit > 0;
    return { shape, hit, found, data, sure, score: offered ? hit + (found ? 1 : 0) : 0 };
  });
}

/** The readings worth offering, best first. Ties go to the shape that comes first in `shapes`. */
const rank = (readings: Reading[]) => readings.filter((r) => r.score > 0).sort((a, b) => Number(b.sure) - Number(a.sure) || b.score - a.score);

/* ---------- deciding, calmly ---------- */

// Readings flicker as a sentence is typed, so the open shape is remembered and only gives way for a reason.
type Memory = {
  /** What this was decided for. */
  text: string;
  shapes: readonly Shape[];
  answer: string | null | undefined;
  readings: Reading[];
  /** The open shape and its last good reading. */
  open: string | null;
  data: unknown;
  /** Picked by hand, from the list or from code. */
  held: boolean;
  /** Chosen by `classify`. */
  told: boolean;
};

const BLANK: Memory = { text: "", shapes: [], answer: undefined, readings: [], open: null, data: undefined, held: false, told: false };

/** `answer` is what `classify` said about this very sentence: a shape's id, null for none, undefined for not yet. */
function decide(prev: Memory, shapes: readonly Shape[], text: string, answer: string | null | undefined): Memory {
  const readings = readAll(shapes, text);
  const base = { text, shapes, answer, readings };
  const closed: Memory = { ...base, open: null, data: undefined, held: false, told: false };
  if (!text.trim()) return closed;

  const of = (id: string | null) => (id === null ? undefined : readings.find((r) => r.shape.id === id));
  // The shape stays open on its last reading while its data is missing for a moment, mid-word.
  const stay = (r: Reading, how: { held?: boolean; told?: boolean } = {}): Memory => ({
    ...base,
    open: r.shape.id,
    data: r.found ? r.data : prev.open === r.shape.id ? prev.data : undefined,
    held: how.held ?? false,
    told: how.told ?? false,
  });

  // A model decides, the code computes: its answer for this sentence outranks the words.
  const told = typeof answer === "string" ? of(answer) : undefined;
  if (told) return stay(told, { told: true });

  const best = rank(readings).find((r) => r.sure);
  const current = of(prev.open);
  if (current) {
    // Picked by hand: it stays until the sentence plainly means another shape and nothing of this one is left.
    if (prev.held && (current.sure || (!best && current.score > 0))) return stay(current, { held: true });
    // Chosen by the model: it stays until the model has read the new sentence, whatever the words say meanwhile.
    if (prev.told && answer === undefined) return stay(current, { told: true });
    // Its words are still there but the data isn't, mid-word: hold the last reading.
    if (!prev.held && !best && current.hit >= 1) return stay(current);
  }
  // Otherwise the shape that reads the most of the sentence, and the earlier one in a tie.
  return best ? stay(best) : closed;
}

/* ---------- the component ---------- */

export type ShapeshiftResult = { shape: Shape | null; data: unknown; text: string };

export type ShapeshiftHandle = {
  focus: () => void;
  /** Open a shape from anywhere on the page, with its example or a sentence of your own. */
  open: (id: string, text?: string) => void;
  clear: () => void;
  /** Rewrite the sentence from outside. */
  setText: (text: string) => void;
};

export type ShapeshiftProps = {
  /** Your shapes. Earlier ones win ties. */
  shapes: readonly Shape[];
  /** The sentence, when you hold it yourself. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (text: string) => void;
  /** Enter. `shape` is null when the sentence didn't open one. */
  onSubmit?: (result: ShapeshiftResult) => void;
  /**
   * Let a model pick the shape: given the sentence, return a shape's id, or null. Asked after a short pause in
   * typing, and its answer outranks the words. The shape's `read` still fills in the data.
   */
  classify?: (text: string, signal: AbortSignal) => Promise<string | null | undefined>;
  /** Show every shape when the field is focused or nothing matches. Turn off for a field that mostly takes free text. */
  listAll?: boolean;
  /** Label for the send button shown when plain text (no shape) can be submitted. */
  sendLabel?: string;
  /** Which way it opens from the field. "top" suits a dock at the foot of a page. */
  side?: "top" | "bottom";
  /** How wide it is, in px. It never grows past its parent. */
  width?: number;
  /** A narrower width to rest at until it's focused or filled. */
  restWidth?: number;
  /** One fixed placeholder, in place of the shapes' examples taking turns. */
  placeholder?: string;
  /** The key that focuses the field from anywhere on the page. */
  hotkey?: string | false;
  /** An icon at the start of the field, if you want one. */
  icon?: ReactNode;
  /** A press outside puts an open shape away. */
  closeOnOutsidePress?: boolean;
  /** The field's accessible name. */
  label?: string;
  className?: string;
  /** Classes for the parts inside. */
  classNames?: Partial<Record<"shell" | "bar" | "input" | "list" | "item" | "panel", string>>;
  ref?: Ref<ShapeshiftHandle>;
};

const EASE = [0.23, 1, 0.32, 1] as const;

/** One icon giving way to another: from small and blurred, a spring with no bounce. */
const SWAP = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: { type: "spring", duration: 0.3, bounce: 0 },
} as const;

const tile = "flex shrink-0 items-center justify-center rounded-[8px] bg-popover-foreground/[0.06] text-[13px] font-medium [&>svg]:size-[18px]";
/** A shape with no icon wears its first letter, so every row still lines up. */
const initial = (s: Shape) => s.label.trim().charAt(0).toUpperCase();
const key = "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-[12px] bg-popover-foreground/[0.06] px-2.5 font-sans text-[11px] text-muted-foreground";

export function Shapeshift({
  shapes,
  value,
  defaultValue = "",
  onValueChange,
  onSubmit,
  classify,
  listAll = true,
  sendLabel,
  side = "top",
  width = 540,
  restWidth,
  placeholder,
  hotkey = "/",
  icon,
  closeOnOutsidePress = true,
  label = "Type anything",
  className,
  classNames,
  ref,
}: ShapeshiftProps) {
  const [inner, setInner] = useState(defaultValue);
  const text = value ?? inner;
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const listId = useId();
  const reduce = useReducedMotion();

  // What the model said, and the sentence it said it about.
  const [meant, setMeant] = useState<{ text: string; id: string | null } | null>(null);
  const answer = meant && meant.text === text ? meant.id : undefined;

  // The decision is kept beside the sentence it was made for, and made again whenever that changes.
  const [memory, setMemory] = useState(() => decide(BLANK, shapes, text, undefined));
  let state = memory;
  if (memory.text !== text || memory.shapes !== shapes || memory.answer !== answer) {
    state = decide(memory, shapes, text, answer);
    setMemory(state);
  }

  const open = shapes.find((s) => s.id === state.open) ?? null;
  const offers = rank(state.readings).map((r) => r.shape);
  // The list: every shape while the field is empty or nothing answers, the ones that answer as you type.
  const answering = offers.length > 0 || !text.trim();
  const list = offers.length > 0 ? offers : shapes;
  const listing = !open && (listAll ? focused || text.trim().length > 0 : offers.length > 0);
  const wide = focused || text.length > 0 || Boolean(open);

  // The highlighted row, remembered only for the sentence it was chosen in.
  const [cursor, setCursor] = useState<{ text: string; index: number } | null>(null);
  const selected = cursor && cursor.text === text ? Math.min(cursor.index, list.length - 1) : answering ? 0 : -1;

  /** Changes the sentence and decides again in the same breath. */
  const commit = (next: string, patch?: Partial<Memory>) => {
    setMemory(decide({ ...state, ...patch }, shapes, next, undefined));
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };
  const clear = () => commit("");
  const pick = (picked: Shape, sentence?: string) => {
    // A shape that already answers what's typed keeps the sentence; any other brings its example.
    const answers = text.trim() && (state.readings.find((r) => r.shape.id === picked.id)?.score ?? 0) > 0;
    commit(sentence ?? (answers ? text : (picked.example ?? picked.label)), { open: picked.id, data: undefined, held: true, told: false });
  };
  const panel = useRef<HTMLDivElement>(null);
  const asking = useRef(false);
  const submit = (edited?: unknown) => {
    // A form inside the open component answers for itself: Enter submits it, and it hands over its own values.
    const form = edited === undefined && !asking.current ? panel.current?.querySelector("form") : null;
    if (form) {
      asking.current = true;
      try {
        form.requestSubmit();
      } finally {
        asking.current = false;
      }
      return;
    }
    const data = edited === undefined ? state.data : edited;
    // An open shape still waiting for its data has nothing to hand over.
    if (open?.read && data === undefined) return;
    if (!text.trim() || (!open?.onSubmit && !onSubmit)) return;
    open?.onSubmit?.(data, text);
    onSubmit?.({ shape: open, data, text });
    clear();
  };

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    open: (id, sentence) => {
      const found = shapes.find((s) => s.id === id);
      if (found) pick(found, sentence);
    },
    clear,
    setText: (next) => commit(next),
  }));

  // The model reads the sentence once typing pauses. A newer sentence drops the older question.
  useEffect(() => {
    const sentence = text.trim();
    if (!classify || !sentence) return;
    const asked = new AbortController();
    const wait = setTimeout(() => {
      // no answer, or no model to ask right now: the words decide
      const heard = (id?: string | null) => !asked.signal.aborted && setMeant({ text, id: id ?? null });
      classify(sentence, asked.signal).then(heard, () => heard());
    }, 220);
    return () => {
      clearTimeout(wait);
      asked.abort();
    };
  }, [classify, text]);

  // The hotkey puts you in the field from anywhere, unless you're typing somewhere else.
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== hotkey || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);

  // A press anywhere else puts an open shape away, unless it lands in something the shape opened over the page.
  useEffect(() => {
    if (!open || !closeOnOutsidePress) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || shell.current?.contains(target)) return;
      if (target.closest?.("dialog, [role='dialog'], [role='menu'], [role='listbox'], [data-shapeshift-keep]")) return;
      clear();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  });

  // Whatever opens beside the field sits in one box, and only that box's height animates, to the measured height
  // of what's in it. So opening, switching and closing are each one change of height, never a collapse and regrow.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!box) return;
    const measure = new ResizeObserver(() => setHeight(box.offsetHeight));
    measure.observe(box);
    return () => measure.disconnect();
  }, [box]);

  const option = (index: number) => `${listId}-${index}`;
  const move = (by: number) => {
    const index = Math.max(0, Math.min(list.length - 1, selected + by));
    setCursor({ text, index });
    requestAnimationFrame(() => document.getElementById(option(index))?.scrollIntoView({ block: "nearest" }));
  };

  // Enter has somewhere to go: the field shows its button.
  const ready = Boolean(open && (open.onSubmit || onSubmit) && !(open.read && state.data === undefined));
  const sendable = Boolean(!open && !listing && sendLabel && onSubmit && text.trim());

  const examples = shapes.flatMap((s) => (s.example ? [`Try “${s.example}”`] : []));
  const rule = <div aria-hidden className="mx-3 h-px bg-border" />;

  const beside = (
    <motion.div initial={false} animate={{ height }} transition={{ duration: reduce ? 0 : 0.26, ease: EASE }} className="overflow-hidden">
      <div ref={setBox} className="relative">
        {/* the view that's leaving is lifted out of the flow and fades where it was, as the next one fades in */}
        <AnimatePresence initial={false} mode="popLayout">
          {open ? (
            <motion.section
              key="panel"
              aria-label={open.label}
              data-slot="shapeshift-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: 0.14, ease: EASE } }}
              className="w-full"
            >
              {side === "bottom" && rule}
              {/* laid out at the open width from its first frame, so nothing re-wraps while the field widens */}
              <div ref={panel} className={cn("relative left-1/2 max-h-[var(--shapeshift-max-height,min(64vh,560px))] w-[100cqw] -translate-x-1/2 overflow-y-auto p-3 [scrollbar-width:thin]", classNames?.panel)}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={open.id}
                    initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -4, filter: "blur(4px)", transition: { duration: 0.12 } }}
                    transition={{ duration: 0.22, ease: EASE }}
                  >
                    {!open.bare && (
                      // what it became, said quietly: the component under it is the loud part
                      <div className="mb-3 flex items-center gap-2.5 text-[13px] text-muted-foreground">
                        {/* 20px corners, 12px in: an 8px tile */}
                        <span className={cn(tile, "size-7 text-popover-foreground [&>svg]:size-4")}>{open.icon ?? initial(open)}</span>
                        <span className="min-w-0 truncate">{open.label}</span>
                      </div>
                    )}
                    {open.read && state.data === undefined ? (
                      // open, but its data isn't in the sentence yet (picked by hand, or by a model)
                      <p className="pb-1 text-[13px] text-muted-foreground">
                        Keep typing and it fills in.
                        {open.example && (
                          <>
                            {" "}
                            <button
                              type="button"
                              onClick={() => pick(open, open.example)}
                              className="cursor-pointer rounded-[6px] text-popover-foreground underline decoration-border decoration-2 underline-offset-4 outline-none hover:decoration-popover-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              Try “{open.example}”
                            </button>
                          </>
                        )}
                      </p>
                    ) : (
                      <Body shape={open} data={state.data} text={text} setText={(next) => commit(next)} submit={submit} close={clear} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
              {side === "top" && rule}
            </motion.section>
          ) : listing ? (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.18, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE } }}
              className="w-full"
            >
              {side === "bottom" && rule}
              <ul
                id={listId}
                role="listbox"
                aria-label="Shapes"
                data-slot="shapeshift-list"
                className={cn("relative left-1/2 max-h-[var(--shapeshift-max-height,min(50vh,380px))] w-[100cqw] -translate-x-1/2 overflow-y-auto p-1.5 [scrollbar-width:thin]", classNames?.list)}
              >
                {list.map((item, index) => (
                  <li
                    key={item.id}
                    id={option(index)}
                    role="option"
                    aria-selected={index === selected}
                    // the field keeps the focus, so the keyboard goes on working after a press
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setCursor({ text, index })}
                    onClick={() => pick(item)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-[14px] p-1.5 pe-3 transition-colors duration-100",
                      index === selected && "bg-muted",
                      classNames?.item,
                    )}
                  >
                    <span className={cn(tile, "size-8")}>{item.icon ?? initial(item)}</span>
                    <span className="min-w-0 flex-1 leading-[1.3]">
                      <span className="block text-[14px]">{item.label}</span>
                      {(item.hint ?? item.example) && <span className="block truncate text-[12.5px] text-muted-foreground">{item.hint ?? item.example}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {side === "top" && rule}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  return (
    <MotionConfig reducedMotion="user">
      {/* the root always holds the open width, so what opens can be laid out at it (100cqw) before the shell gets there */}
      <div
        data-slot="shapeshift"
        data-state={open ? "open" : listing ? "listing" : "rest"}
        data-shape={open?.id}
        className={cn("pointer-events-none flex w-full justify-center [container-type:inline-size]", className)}
        style={{ maxWidth: width }}
      >
        {/* the width is a plain CSS transition: the browser runs it without React rendering every frame */}
        <div
          ref={shell}
          data-slot="shapeshift-shell"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || (!open && !text)) return;
            event.stopPropagation();
            clear();
            input.current?.blur();
          }}
          className={cn(
            "pointer-events-auto max-w-full overflow-hidden rounded-[20px] bg-popover text-popover-foreground shadow-popover transition-[width] duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            classNames?.shell,
          )}
          style={{ width: restWidth === undefined || wide ? "100%" : restWidth }}
        >
          {side === "top" && beside}

          <div data-slot="shapeshift-bar" className={cn("flex h-12 items-center gap-2 ps-4 pe-2", classNames?.bar)}>
            {icon && <span className="me-1 flex size-[18px] shrink-0 items-center justify-center [&>svg]:size-[18px]">{icon}</span>}
            <span className="relative h-full min-w-0 flex-1">
              {!text && !placeholder && examples.length > 0 && <Cycle lines={examples} />}
              <input
                ref={input}
                value={text}
                onChange={(event) => commit(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (listing && event.key === "ArrowDown") {
                    event.preventDefault();
                    move(1);
                  } else if (listing && event.key === "ArrowUp") {
                    event.preventDefault();
                    move(-1);
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    if (listing && list[selected]) pick(list[selected]);
                    else submit();
                  }
                }}
                role="combobox"
                aria-label={label}
                aria-expanded={listing}
                aria-controls={listing ? listId : undefined}
                aria-activedescendant={listing && selected >= 0 ? option(selected) : undefined}
                aria-autocomplete="list"
                placeholder={placeholder ?? (examples.length > 0 ? undefined : label)}
                autoComplete="off"
                spellCheck={false}
                data-slot="shapeshift-input"
                // 16px on a phone, so iOS doesn't zoom the page when the field is focused
                className={cn("relative size-full bg-transparent text-[16px] outline-none placeholder:text-muted-foreground sm:text-[14px]", classNames?.input)}
              />
            </span>
            {/* 48px bar, 8px in: 32px keys with 12px corners */}
            <AnimatePresence mode="popLayout" initial={false}>
              {text || open ? (
                <motion.button
                  key="clear"
                  type="button"
                  onClick={() => {
                    clear();
                    input.current?.focus();
                  }}
                  aria-label="Clear"
                  {...SWAP}
                  // on a narrow field the action needs the room more than a second way to press Esc
                  className={cn(key, "cursor-pointer outline-none transition-colors duration-150 hover:text-popover-foreground focus-visible:ring-2 focus-visible:ring-ring", (ready || sendable) && "@max-sm:hidden")}
                >
                  esc
                </motion.button>
              ) : hotkey ? (
                <motion.kbd key="hotkey" {...SWAP} className={key}>
                  {hotkey}
                </motion.kbd>
              ) : null}
              {((ready && open) || sendable) && (
                <motion.button
                  key="action"
                  type="button"
                  onClick={() => submit()}
                  {...SWAP}
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[12px] bg-primary ps-3 pe-2 text-[13px] font-medium whitespace-nowrap text-primary-foreground outline-none transition-[opacity,scale] duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover active:scale-[0.96]"
                >
                  {open ? (open.action ?? "Add") : sendLabel}
                  <ReturnIcon />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {side === "bottom" && beside}
          <span aria-live="polite" className="sr-only">
            {open ? open.label : ""}
          </span>
        </div>
      </div>
    </MotionConfig>
  );
}

/** A shape's component, mounted as a component of its own, so hooks inside `render` work. */
function Body({ shape, ...props }: { shape: Shape } & ShapeProps<unknown>) {
  return <>{shape.render(props)}</>;
}

/** The empty field's line: the shapes' examples, taking turns. Holds still while the tab is hidden. */
function Cycle({ lines }: { lines: string[] }) {
  const [turn, setTurn] = useState(0);
  const several = lines.length > 1;
  useEffect(() => {
    if (!several) return;
    const next = setInterval(() => !document.hidden && setTurn((t) => t + 1), 3200);
    return () => clearInterval(next);
  }, [several]);
  const line = lines[turn % lines.length];
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-[16px] text-muted-foreground sm:text-[14px]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={line}
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.25, ease: EASE }}
          className="min-w-0 truncate"
        >
          {line}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const ReturnIcon = () => (
  <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="opacity-60">
    <path d="M14.6 4.4v3.4a2.2 2.2 0 01-2.2 2.2H3.6M6.5 7.1L3.6 10l2.9 2.9" />
  </svg>
);
