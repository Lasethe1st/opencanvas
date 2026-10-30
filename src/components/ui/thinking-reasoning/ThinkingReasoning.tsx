"use client";

import styles from "./ThinkingReasoning.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Geometry — keep in sync with the CSS module.
const SENT_H = 40; // 2 lines × 20px
const GAP = 4;
const MAX_H = 180;
const FADE = 16;

/** Split streamed reasoning into short display lines. */
function splitReasoning(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const parts = clean
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z“"(\[])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [clean];
}

export interface ThinkingReasoningProps {
  /** Full reasoning text (grows while the model thinks). */
  text: string;
  /** When true, folds into the “Thought for Ns” summary. */
  done?: boolean;
  className?: string;
}

/**
 * aicss Thinking + Reasoning — shimmering “Thinking…” expands to the
 * agent’s reasoning, then folds into a “Thought for Ns” summary.
 */
export function ThinkingReasoning({ text, done = false, className }: ThinkingReasoningProps) {
  const startedAt = useRef(Date.now());
  const restored = useRef(done);
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(1);
  const [fade, setFade] = useState({ top: false, bottom: true });
  const viewportRef = useRef<HTMLDivElement>(null);
  const sentences = useMemo(() => splitReasoning(text), [text]);

  useEffect(() => {
    if (done) {
      if (!restored.current) {
        setElapsed(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
      }
      setOpen(false);
      return;
    }
    const id = window.setInterval(() => {
      setElapsed(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
    }, 400);
    return () => clearInterval(id);
  }, [done]);

  // Keep the stream pinned to the latest line while thinking.
  useEffect(() => {
    if (done || !viewportRef.current) return;
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [sentences.length, done]);

  const expanded = done ? open : true;
  const count = sentences.length;
  const contentH = count > 0 ? count * SENT_H + (count - 1) * GAP : 0;
  const capped = contentH > MAX_H;
  const viewH = expanded ? (capped ? MAX_H : contentH) : 0;
  const scrollable = done && open;
  const translate = scrollable ? 0 : capped && !done ? MAX_H - FADE - contentH : 0;

  const showTop = scrollable ? fade.top : capped && !done;
  const showBottom = scrollable ? fade.bottom : capped && !done;
  const mask = capped
    ? `linear-gradient(to bottom, transparent 0, #000 ${showTop ? FADE : 0}px, #000 calc(100% - ${showBottom ? FADE : 0}px), transparent 100%)`
    : "none";

  const onScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    setFade({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  };

  const toggle = () => {
    const next = !open;
    if (next) {
      setFade({ top: false, bottom: true });
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    }
    setOpen(next);
  };

  const summary = restored.current ? "Thoughts" : (
    <>
      <span className={styles.trVerb}>Thought</span> for {elapsed}s
    </>
  );

  return (
    <div className={cn(styles.tr, className)} data-done={done ? "" : undefined}>
      <button
        type="button"
        className={styles.trHeader + (done ? " " + styles.isClickable : "")}
        aria-expanded={expanded}
        aria-label={done ? "Toggle thought" : "Thinking"}
        onClick={done ? toggle : undefined}
      >
        {done ? (
          <span className={styles.trLabel}>{summary}</span>
        ) : (
          <span className={styles.trLabel + " " + styles.trShimmer}>Thinking…</span>
        )}
        {done && (
          <svg className={styles.trChevron} viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path
              d="m4.5 15.75 7.5-7.5 7.5 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <div className={styles.trCollapsible + (expanded ? "" : " " + styles.isCollapsed)}>
        <div className={styles.trInner}>
          <div
            ref={viewportRef}
            className={styles.trViewport + (scrollable ? " " + styles.isScroll : "")}
            style={{ height: `${viewH}px`, WebkitMaskImage: mask, maskImage: mask }}
            onScroll={scrollable ? onScroll : undefined}
          >
            <div className={styles.trStream} style={{ transform: `translateY(${translate}px)` }}>
              {sentences.map((line, i) => (
                <p key={`${i}:${line.slice(0, 24)}`} className={styles.trSentence}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
