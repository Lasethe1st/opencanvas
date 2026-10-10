export function StateCard({ icon, busy, title, children, actions, log }) {
  return (
    <div className="state-card">
      {busy ? (
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 14 }}>
          <div className="spinner" />
        </div>
      ) : (
        icon && <div className="state-card__icon">{icon}</div>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="state-card__actions">{actions}</div>}
      {log && <pre className="state-card__log">{log}</pre>}
    </div>
  );
}
