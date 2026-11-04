import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { describeStyle } from '../../../shared/design-context';
import type { VisualStyle } from '../../../shared/project-config';

const SUMMARY_EASE = [0.23, 1, 0.32, 1] as const;

const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
const DOT_COLS = 17;
const DOT_ROWS = 17;

/** Dot grid that grows near the thumb (scale + opacity via CSS vars for smooth motion). */
function PadDots({ x, y }: { x: number; y: number }) {
  const dots = useMemo(() => {
    const nodes = [];
    for (let r = 0; r < DOT_ROWS; r++) {
      for (let c = 0; c < DOT_COLS; c++) {
        const px = c / (DOT_COLS - 1);
        const py = r / (DOT_ROWS - 1);
        const d = Math.hypot(px - x, py - (1 - y));
        const t = Math.max(0, 1 - d / 0.55);
        const scale = 0.3 + t * t * 1.15;
        const opacity = 0.28 + t * 0.6;
        nodes.push({ key: `${c}-${r}`, left: `${px * 100}%`, top: `${py * 100}%`, scale, opacity });
      }
    }
    return nodes;
  }, [x, y]);

  return (
    <span className="direction-pad__dots" aria-hidden>
      {dots.map((d) => (
        <span
          key={d.key}
          className="direction-pad__dot"
          style={{ left: d.left, top: d.top, ['--s' as string]: d.scale, ['--o' as string]: d.opacity }}
        />
      ))}
    </span>
  );
}

/**
 * Two-axis pad: minimal ↔ expressive across, casual ↔ professional up and down (professional at the top).
 * Arrows move by 0.05, Shift+arrows by 0.1, Home recentres.
 */
export function DirectionPicker({ value, onChange, compact }: { value: VisualStyle; onChange: (v: VisualStyle) => void; compact?: boolean }) {
  const pad = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const reduce = useReducedMotion();
  const { minimalExpressive: x, casualProfessional: y } = value;

  const fromPointer = (e: PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    onChange({ minimalExpressive: round((e.clientX - r.left) / r.width), casualProfessional: round(1 - (e.clientY - r.top) / r.height) });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.05;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key === 'Home') {
      e.preventDefault();
      onChange({ minimalExpressive: 0.5, casualProfessional: 0.5 });
    } else if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      onChange({ minimalExpressive: round(x + dx), casualProfessional: round(y + dy) });
    }
  };

  const summary = describeStyle(value);
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className={`direction-picker${compact ? ' is-compact' : ''}`}>
      <span className="direction-picker__axis direction-picker__axis--top" aria-hidden>
        Professional
      </span>
      <div className="direction-picker__row">
        <span className="direction-picker__axis direction-picker__axis--side" aria-hidden>
          Minimal
        </span>
        <div
          ref={pad}
          className={`direction-pad${dragging ? ' is-dragging' : ''}`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            fromPointer(e);
            (e.currentTarget.querySelector('[role="slider"]') as HTMLElement | null)?.focus();
          }}
          onPointerMove={(e) => dragging && fromPointer(e)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          <PadDots x={x} y={y} />
          <span
            className="direction-pad__thumb"
            role="slider"
            tabIndex={0}
            aria-label="Visual direction"
            aria-roledescription="2D slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(x * 100)}
            aria-valuetext={`${summary}. Expressive ${pct(x)}, professional ${pct(y)}. Left and right for minimal to expressive, up and down for casual to professional, Home to reset.`}
            style={{ left: `${x * 100}%`, top: `${(1 - y) * 100}%` }}
            onKeyDown={onKeyDown}
          />
        </div>
        <span className="direction-picker__axis direction-picker__axis--side" aria-hidden>
          Expressive
        </span>
      </div>
      <span className="direction-picker__axis direction-picker__axis--bottom" aria-hidden>
        Casual
      </span>
      <motion.p
        layout
        className="direction-picker__summary"
        aria-live="polite"
        transition={{ layout: { duration: reduce ? 0 : 0.22, ease: SUMMARY_EASE } }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={summary}
            className="direction-picker__summary-text"
            initial={reduce ? false : { opacity: 0, y: 4, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduce ? undefined : { opacity: 0, y: -4, filter: 'blur(8px)' }}
            transition={{ duration: reduce ? 0 : 0.24, ease: SUMMARY_EASE }}
          >
            {summary}
          </motion.span>
        </AnimatePresence>
      </motion.p>
    </div>
  );
}
