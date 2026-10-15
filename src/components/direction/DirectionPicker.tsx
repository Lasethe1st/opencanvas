import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { describeStyle } from '../../../shared/design-context';
import type { VisualStyle } from '../../../shared/project-config';

const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;

/**
 * Two-axis pad: minimal ↔ expressive across, casual ↔ professional up and down (professional at the top).
 * Arrows move by 0.05, Shift+arrows by 0.1, Home recentres.
 */
export function DirectionPicker({ value, onChange, compact }: { value: VisualStyle; onChange: (v: VisualStyle) => void; compact?: boolean }) {
  const pad = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
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
          <span className="direction-pad__cross" aria-hidden />
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
      <p className="direction-picker__summary" aria-live="polite">
        {summary}
      </p>
    </div>
  );
}
