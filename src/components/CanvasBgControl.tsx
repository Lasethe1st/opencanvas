import { useEffect, useId, useState } from 'react';
import { applyCanvasBg, defaultCanvasBg, readCanvasBg, writeCanvasBg } from '../lib/canvas-bg';
import { useTheme } from '../lib/theme';

/** Pill + filled circle that sets only the free-canvas backdrop color. */
export function CanvasBgControl() {
  const theme = useTheme().resolved;
  const inputId = useId();
  const [color, setColor] = useState(() => readCanvasBg() ?? defaultCanvasBg(theme));

  useEffect(() => {
    const stored = readCanvasBg();
    if (stored) {
      setColor(stored);
      applyCanvasBg(stored);
      return;
    }
    setColor(defaultCanvasBg(theme));
    applyCanvasBg(null);
  }, [theme]);

  const onPick = (next: string) => {
    setColor(next);
    writeCanvasBg(next);
    applyCanvasBg(next);
  };

  return (
    <label
      className="canvas-bg-pill"
      htmlFor={inputId}
      title="Canvas background · right-click to reset"
      data-tip="Canvas background"
      data-tip-side="bottom"
      onContextMenu={(e) => {
        e.preventDefault();
        writeCanvasBg(null);
        const fallback = defaultCanvasBg(theme);
        setColor(fallback);
        applyCanvasBg(null);
      }}
    >
      <input
        id={inputId}
        type="color"
        className="canvas-bg-pill__input"
        value={color}
        aria-label="Canvas background color"
        onChange={(e) => onPick(e.target.value)}
      />
      <span className="canvas-bg-pill__swatch" style={{ background: color }} aria-hidden />
    </label>
  );
}
