import { useEffect, useRef, useState } from "react";
import { useMicLevel } from "../../lib/mic-level";

const DOT = 6;
const GAP = 5;

/**
 * Shown above the composer while dictating: a row of dots that grow into vertical pills as you speak.
 * The row scrolls, so the newest sound enters on the right and older sound drifts left.
 * Bars are updated straight on the DOM, so a 60fps meter never re-renders React.
 */
export function ListeningWave({
  label = "Listening",
  demo = false,
  height = 64,
  radius = 24,
}: {
  label?: string;
  demo?: boolean;
  /** Box height in px: the start screen uses 64, a chat matches its composer. */
  height?: number;
  radius?: number | string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(40);
  const max = Math.max(DOT + 4, height - 20);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const history = useRef<number[]>(Array(40).fill(0));
  const smooth = useRef(0);
  const last = useRef(0);
  const reduced = useRef(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // As many bars as fit the box's whole width; a resize keeps the newest sound on the right.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const n = Math.max(8, Math.floor((el.clientWidth - 32 + GAP) / (DOT + GAP)));
      const h = history.current;
      history.current = n > h.length ? [...Array(n - h.length).fill(0), ...h] : h.slice(h.length - n);
      setCount(n);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paint = () => {
    history.current.forEach((v, i) => {
      const el = bars.current[i];
      if (!el) return;
      const h = DOT + v * (max - DOT);
      el.style.height = `${h}px`;
      el.style.opacity = String(0.35 + Math.min(1, v * 1.4) * 0.65);
    });
  };

  const push = (level: number) => {
    // Fast attack, slower release: pills snap up on a syllable and ease back to dots.
    smooth.current = level > smooth.current ? level : smooth.current * 0.82 + level * 0.18;
    const now = performance.now();
    if (now - last.current < 55) return;
    last.current = now;
    history.current.push(reduced.current ? (smooth.current > 0.08 ? 0.5 : 0) : smooth.current);
    history.current.shift();
    paint();
  };

  useMicLevel(!demo, push);

  // Screenshot / preview mode: a synthetic voice so the shape can be seen without a microphone.
  useEffect(() => {
    if (!demo) return;
    let t = 0;
    const id = setInterval(() => {
      t += 1;
      push(Math.max(0, Math.sin(t / 4) * 0.5 + Math.sin(t / 1.7) * 0.3 + 0.15) * (t % 40 < 30 ? 1 : 0));
    }, 60);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  return (
    <div
      ref={box}
      data-listening=""
      role="status"
      aria-live="polite"
      className="mb-3 flex w-full items-center justify-center overflow-hidden bg-muted/70 shadow-[inset_0_0_0_1px_var(--composer-edge)] [corner-shape:squircle]"
      style={{ height, borderRadius: radius }}
    >
      <span className="sr-only">{label}</span>
      <div className="flex items-center justify-center" style={{ gap: GAP }} aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              bars.current[i] = el;
            }}
            className="w-[6px] shrink-0 rounded-full bg-foreground transition-[height] duration-75 ease-out"
            style={{ height: DOT, opacity: 0.35 }}
          />
        ))}
      </div>
    </div>
  );
}
