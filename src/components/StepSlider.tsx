import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * A full-width stepped slider with a vertical pill for a thumb. Drag or click anywhere on the track; arrows, Home and End also work.
 * While dragging the thumb follows the pointer, then settles on the nearest stop.
 */
export function StepSlider<T extends string>({ value, onChange, stops, onPreview, ariaLabel }: {
  value: T;
  onChange: (next: T) => void;
  stops: readonly { id: T; label: string }[];
  /** The stop under the thumb while dragging, so a caption can follow it. */
  onPreview?: (id: T) => void;
  ariaLabel: string;
}) {
  const max = stops.length - 1;
  const index = Math.max(0, stops.findIndex((s) => s.id === value));
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const pos = drag ?? index;

  const from = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return index;
    const pad = 10; // half the thumb plus its inset, so the thumb's centre spans the usable width
    return Math.min(max, Math.max(0, ((clientX - r.left - pad) / (r.width - pad * 2)) * max));
  };
  const preview = (p: number) => onPreview?.(stops[Math.round(p)].id);
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* untrusted event */ }
    const p = from(e.clientX);
    setDrag(p);
    preview(p);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (drag == null) return;
    const p = from(e.clientX);
    setDrag(p);
    preview(p);
  };
  const up = () => {
    if (drag == null) return;
    const next = stops[Math.round(drag)].id;
    setDrag(null);
    if (next !== value) onChange(next);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? max : step ? Math.min(max, Math.max(0, index + step)) : null;
    if (to == null) return;
    e.preventDefault();
    onChange(stops[to].id);
  };

  return (
    <div
      ref={ref}
      className="stepslider"
      data-dragging={drag != null ? 'true' : 'false'}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={index}
      aria-valuetext={stops[index].label}
      style={{ ['--t' as string]: (pos / max).toFixed(4) }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    >
      <div className="stepslider__fill" />
      <div className="stepslider__thumb" />
    </div>
  );
}
