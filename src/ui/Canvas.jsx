import { Maximize, Minus, Plus, RefreshCw } from 'lucide-react';
import { Button, IconButton } from './primitives.jsx';

export function CanvasBar({ label, zoom, onZoomOut, onZoomIn, onFit, onActual, fitActive, onReload }) {
  return (
    <div className="canvas-bar">
      <span>{label}</span>
      <div className="canvas-bar__group">
        <IconButton size="sm" label="Zoom out" onClick={onZoomOut}>
          <Minus size={13} />
        </IconButton>
        <span data-oc="span-clrpm" className="canvas-bar__zoom">{zoom}</span>
        <IconButton size="sm" label="Zoom in" onClick={onZoomIn}>
          <Plus size={13} />
        </IconButton>
        <Button variant="ghost" size="sm" icon={<Maximize size={12} />} onClick={onFit} className={fitActive ? 'is-active' : undefined}>
          Fit
        </Button>
        <Button variant="ghost" size="sm" onClick={onActual}>
          100%
        </Button>
        {onReload && (
          <IconButton size="sm" label="Reload preview" onClick={onReload}>
            <RefreshCw size={12} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

export function Canvas({ bar, notice, children, overlay, dock, stageRef, ...rest }) {
  return (
    <section className="canvas" aria-label="Canvas" {...rest}>
      {bar}
      {notice && <div style={{ padding: '0 32px 8px' }}>{notice}</div>}
      <div className="canvas-stage" ref={stageRef}>
        {children}
      </div>
      {overlay && <div className="canvas-overlay">{overlay}</div>}
      {dock}
    </section>
  );
}

export function CanvasFrame({ width, height, scale = 1, children }) {
  return (
    <div style={{ width: width * scale, height: height * scale, margin: '0 auto' }}>
      <div className="canvas-frame" style={{ width, height, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

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
