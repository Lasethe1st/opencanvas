import { useEffect, useRef } from 'react';
import type { Camera } from '../../shared/canvas';
import { useRulers } from '../lib/rulers';

const SIZE = 20;

/** Picks a tick spacing in canvas units that lands at least `min` screen pixels apart. */
function stepFor(zoom: number, min = 56): number {
  const raw = min / Math.max(zoom, 0.0001);
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (pow * m >= raw) return pow * m;
  return pow * 10;
}

function draw(el: HTMLCanvasElement, axis: 'x' | 'y', camera: Camera) {
  const dpr = window.devicePixelRatio || 1;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return;
  if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
  }
  const ctx = el.getContext('2d');
  if (!ctx) return;
  const css = getComputedStyle(el);
  const ink = css.getPropertyValue('--muted-foreground').trim() || '#888';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.9;
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
  ctx.lineWidth = 1;

  const len = axis === 'x' ? w : h;
  const offset = axis === 'x' ? camera.x : camera.y;
  const step = stepFor(camera.zoom);
  const minor = step / 5;
  const first = Math.floor((SIZE - offset) / camera.zoom / minor) * minor;
  const last = (len - offset) / camera.zoom;
  ctx.beginPath();
  for (let v = first; v <= last; v += minor) {
    const p = Math.round(v * camera.zoom + offset) + 0.5;
    if (p < SIZE) continue;
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    const tick = major ? SIZE : 5;
    if (axis === 'x') {
      ctx.moveTo(p, SIZE);
      ctx.lineTo(p, SIZE - tick);
    } else {
      ctx.moveTo(SIZE, p);
      ctx.lineTo(SIZE - tick, p);
    }
    if (major) {
      const label = String(Math.round(v));
      if (axis === 'x') ctx.fillText(label, p + 3, 10);
      else {
        ctx.save();
        ctx.translate(10, p + 3);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right';
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
  }
  ctx.stroke();
}

/** Top and left rulers in canvas units, following the camera. Shown when the ruler pill is on. */
export function CanvasRulers({ camera }: { camera: Camera }) {
  const on = useRulers();
  const top = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!on) return;
    const paint = () => {
      if (top.current) draw(top.current, 'x', camera);
      if (left.current) draw(left.current, 'y', camera);
    };
    paint();
    const ro = new ResizeObserver(paint);
    if (top.current) ro.observe(top.current);
    if (left.current) ro.observe(left.current);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', paint);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', paint);
    };
  }, [on, camera]);

  if (!on) return null;
  return (
    <div className="canvas-rulers" aria-hidden>
      <canvas ref={top} className="canvas-rulers__top" />
      <canvas ref={left} className="canvas-rulers__left" />
      <span className="canvas-rulers__corner" />
    </div>
  );
}
