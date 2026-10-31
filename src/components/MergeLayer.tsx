import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** A shape to fill, in the layer's own pixels. `r` is its corner radius, `o` its opacity. */
export type MergeBox = { x: number; y: number; w: number; h: number; r: number; o: number };
export type MergeAxis = 'row' | 'column';

/** Pills further apart than this stay separate bubbles. */
const MAX_GAP = 32;
/** How far the waist pinches in, as a share of the shorter side (merging-bubbles uses about a fifth). */
const WAIST = 0.2;

export function radiusOf(cs: CSSStyleDeclaration, w: number, h: number): number {
  const r = parseFloat(cs.borderTopLeftRadius) || 0;
  return Math.min(r, w / 2, h / 2);
}

/** Swaps x and y so one routine can draw both rows and columns. */
const flip = (b: MergeBox): MergeBox => ({ x: b.y, y: b.x, w: b.h, h: b.w, r: b.r, o: b.o });

/**
 * The curved neck between two neighbours in a row, like cult-ui's merging bubbles:
 * it starts where each shape's flat edge ends, dips to a waist halfway across the gap,
 * and rises back into the next shape. Drawn on top of both shapes, so the union is one outline.
 */
function neck(a: MergeBox, b: MergeBox): string | null {
  const gap = b.x - (a.x + a.w);
  if (gap > MAX_GAP || gap < -Math.min(a.w, b.w) / 2) return null;
  const y0 = Math.max(a.y, b.y);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const band = y1 - y0;
  if (band <= 4) return null;
  // On the shorter side, start where its rounded corner begins; on a taller side, just inside its wall.
  const insetA = a.y >= y0 - 0.5 && a.y + a.h <= y1 + 0.5 ? Math.max(a.r, 1) : 1;
  const insetB = b.y >= y0 - 0.5 && b.y + b.h <= y1 + 0.5 ? Math.max(b.r, 1) : 1;
  const xl = a.x + a.w - insetA;
  const xr = b.x + insetB;
  const m = (a.x + a.w + b.x) / 2;
  // Wider gaps stretch the neck and pinch it a little thinner, like goo being pulled.
  const d = band * Math.min(0.3, WAIST + Math.max(gap, 0) * 0.006);
  const kl = (m - xl) * 0.55;
  const kr = (xr - m) * 0.55;
  const f = (n: number) => Math.round(n * 100) / 100;
  return [
    `M${f(xl)},${f(y0)}`,
    `C${f(xl + kl)},${f(y0)} ${f(m - kl * 0.6)},${f(y0 + d)} ${f(m)},${f(y0 + d)}`,
    `C${f(m + kr * 0.6)},${f(y0 + d)} ${f(xr - kr)},${f(y0)} ${f(xr)},${f(y0)}`,
    `L${f(xr)},${f(y1)}`,
    `C${f(xr - kr)},${f(y1)} ${f(m + kr * 0.6)},${f(y1 - d)} ${f(m)},${f(y1 - d)}`,
    `C${f(m - kl * 0.6)},${f(y1 - d)} ${f(xl + kl)},${f(y1)} ${f(xl)},${f(y1)}`,
    'Z',
  ].join(' ');
}

function transpose(path: string): string {
  return path.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x, y) => `${y},${x}`);
}

/** Fills each box and joins neighbours with curved necks, so a group reads as one liquid shape. */
export function MergeLayer({ boxes, axis = 'row', className }: { boxes: MergeBox[]; axis?: MergeAxis; className?: string }) {
  const along = axis === 'row' ? boxes : boxes.map(flip);
  const order = along.map((b, i) => ({ b, i })).sort((p, q) => p.b.x - q.b.x);
  const necks: Array<{ d: string; o: number; key: string }> = [];
  for (let n = 0; n + 1 < order.length; n++) {
    const a = order[n].b;
    const b = order[n + 1].b;
    const d = neck(a, b);
    if (d) necks.push({ d: axis === 'row' ? d : transpose(d), o: Math.min(a.o, b.o), key: `${order[n].i}-${order[n + 1].i}` });
  }
  return (
    <svg className={`merge-layer${className ? ` ${className}` : ''}`} aria-hidden>
      {boxes.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.r} ry={b.r} opacity={b.o} />
      ))}
      {necks.map((n) => (
        <path key={n.key} className="merge-layer__neck" d={n.d} opacity={n.o} />
      ))}
    </svg>
  );
}

/** Measures `[data-merge]` children while they move, for a MergeLayer behind them. */
export function useMergeBoxes(selector = '[data-merge]') {
  const ref = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<MergeBox[]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let still = 0;
    let last = '';
    const measure = () => {
      const box = el.getBoundingClientRect();
      const next: MergeBox[] = [];
      for (const n of el.querySelectorAll<HTMLElement>(selector)) {
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(n);
        next.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, r: radiusOf(cs, r.width, r.height), o: parseFloat(cs.opacity) });
      }
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        still = 0;
        setBoxes(next);
      } else still++;
      raf = still > 20 ? 0 : requestAnimationFrame(measure);
    };
    const wake = () => {
      still = 0;
      if (!raf) raf = requestAnimationFrame(measure);
    };
    wake();
    const ro = new ResizeObserver(wake);
    ro.observe(el);
    const mo = new MutationObserver(wake);
    mo.observe(el, { childList: true, subtree: true, attributes: true });
    el.addEventListener('transitionrun', wake);
    el.addEventListener('animationstart', wake);
    window.addEventListener('resize', wake);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('transitionrun', wake);
      el.removeEventListener('animationstart', wake);
      window.removeEventListener('resize', wake);
    };
  }, [selector]);
  return { ref, boxes };
}

/** A row or column of pills drawn as one merged bubble. Mark each pill with `data-merge`. */
export function MergeGroup({ axis = 'row', className, style, children }: { axis?: MergeAxis; className?: string; style?: React.CSSProperties; children: ReactNode }) {
  const { ref, boxes } = useMergeBoxes();
  return (
    <div ref={ref} className={`merge-group merge-group--${axis}${className ? ` ${className}` : ''}`} style={style}>
      <MergeLayer boxes={boxes} axis={axis} />
      {children}
    </div>
  );
}
