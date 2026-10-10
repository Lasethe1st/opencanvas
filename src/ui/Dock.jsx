export function Dock({ children }) {
  return (
    <div data-oc="div-ukpws" className="dock" role="toolbar" aria-label="Canvas actions">
      {children}
    </div>
  );
}

export function DockSeparator() {
  return <span className="dock__sep" />;
}

export function DockContext({ verb, target }) {
  return (
    <span className="dock__context">
      {verb} <strong>{target}</strong>
    </span>
  );
}
