import { forwardRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './primitives.jsx';

/** Column that stacks one or more hug-height tool rails on the workspace edge. */
export function ToolRails({ children }) {
  return <div className="tool-rails">{children}</div>;
}

/** One floating vertical capsule of tool buttons. */
export function ToolRail({ children, label = 'Tools' }) {
  return (
    <nav className="tool-rail" aria-label={label}>
      {children}
    </nav>
  );
}

export const ToolButton = forwardRef(function ToolButton({ label, shortcut, active, children, className, ...rest }, ref) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      ref={ref}
      className={cx('tool-btn', active && 'is-active', className)}
      aria-label={label}
      aria-pressed={active}
      data-tip={tip}
      data-tip-side="right"
      {...rest}
    >
      {children}
    </button>
  );
});

export function ToolGroup({ children }) {
  return <div className="tool-rail__group">{children}</div>;
}

export function ToolSeparator() {
  return <span className="tool-rail__sep" />;
}

/**
 * Popover to the right of a rail button. Portaled to body so the layers panel
 * and the rail’s overflow:hidden can’t clip it (same idea as the home nav flyout).
 */
export function ToolFlyout({ title, children, anchor }) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const update = () => setRect(anchor.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchor]);

  if (!anchor || !rect) return null;

  const top = Math.min(rect.top, window.innerHeight - 24);
  // Rails sit between the left panel and the canvas — open just past the button.
  const left = rect.right + 12;

  return createPortal(
    <div
      className="popover tool-flyout tool-flyout--portal"
      role="menu"
      data-theme={document.documentElement.dataset.theme || undefined}
      style={{
        top,
        left,
        transform: rect.top > window.innerHeight - 200 ? 'translateY(-40%)' : undefined,
      }}
    >
      {title && <div className="menu-title">{title}</div>}
      {children}
    </div>,
    document.body,
  );
}
