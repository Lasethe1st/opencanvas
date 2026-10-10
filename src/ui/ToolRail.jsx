import { cx } from './primitives.jsx';

/** Persistent vertical tool rail on the left edge of the workspace. */
export function ToolRail({ children }) {
  return (
    <nav className="tool-rail" aria-label="Tools">
      {children}
    </nav>
  );
}

export function ToolButton({ label, shortcut, active, children, className, ...rest }) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button className={cx('tool-btn', active && 'is-active', className)} aria-label={label} aria-pressed={active} data-tip={tip} data-tip-side="right" {...rest}>
      {children}
    </button>
  );
}

export function ToolGroup({ children }) {
  return <div className="tool-rail__group">{children}</div>;
}

export function ToolSeparator() {
  return <span className="tool-rail__sep" />;
}

/** Popover that opens to the right of a rail button. */
export function ToolFlyout({ title, children }) {
  return (
    <div className="popover tool-flyout" role="menu">
      {title && <div className="menu-title">{title}</div>}
      {children}
    </div>
  );
}
