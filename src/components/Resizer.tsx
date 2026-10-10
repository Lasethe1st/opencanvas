import { useEffect, useRef, useState } from 'react';
import { Resizer as Handle } from '../ui/Panels.jsx';

export function Resizer({ value, onChange, min, max, invert = false }: { value: number; onChange: (v: number) => void; min: number; max: number; invert?: boolean }) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, value: 0 });
  const latest = useRef({ onChange, min, max, invert });
  latest.current = { onChange, min, max, invert };

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const { onChange, min, max, invert } = latest.current;
      const delta = (event.clientX - start.current.x) * (invert ? -1 : 1);
      onChange(Math.min(max, Math.max(min, start.current.value + delta)));
    };
    const stop = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging]);

  return (
    <Handle
      dragging={dragging}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, value };
        setDragging(true);
      }}
    />
  );
}
