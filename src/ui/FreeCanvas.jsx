import { Computer, Focus, Frame, Link2, Maximize, Minus, MoreHorizontal, Plus, Redo2, ScanSearch, Smartphone, Tablet, Undo2 } from '../lib/hugeicons';

/** One icon per frame preset, in place of a text label. Custom-size frames get a plain frame icon. */
export const DEVICE_ICON = { desktop: Computer, laptop: Computer, tablet: Tablet, mobile: Smartphone, custom: Frame };
import { cx, IconButton } from './primitives.jsx';

/** The infinite surface: a dotted background that pans/zooms with the camera and a transformed world layer. */
export function Stage({ stageRef, camera, dots, tool, panning, world, chrome, overlay, notice, nav, dock, className, ...rest }) {
  const size = 20 * camera.zoom;
  return (
    <section className={cx('stage', tool === 'hand' && 'is-hand', panning && 'is-panning', className)} aria-label="Canvas" {...rest}>
      <div className="stage__viewport" ref={stageRef}>
        <div
          className="stage__dots"
          style={{
            opacity: dots,
            backgroundSize: `${size}px ${size}px`,
            backgroundPosition: `${camera.x}px ${camera.y}px`,
          }}
        />
        <div className="stage__world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
          {world}
        </div>
        <div className="stage__chrome">{chrome}</div>
        {(tool === 'hand' || panning) && <div className="stage__capture" />}
      </div>
      {notice && <div className="stage__notice">{notice}</div>}
      {overlay && <div className="canvas-overlay">{overlay}</div>}
      {nav}
      {dock}
    </section>
  );
}

/** A preview frame positioned in world coordinates. */
export function WorldFrame({ x, y, width, height, active, shadow, children }) {
  return (
    <div className={cx('world-frame', active && 'is-active', shadow && 'has-shadow')} style={{ left: x, top: y, width, height }}>
      {children}
    </div>
  );
}

/** One filled circle that gooily splits into two and melts back, over and over: the AI is working here. */
export function AiWeave({ className }) {
  return (
    <span className={cx('ai-weave', className)} role="status" aria-label="AI is working">
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <filter id="oc-goo" x="-50%" y="-100%" width="200%" height="300%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
        </filter>
      </svg>
      <span className="ai-weave__stage">
        <i className="ai-weave__a" />
        <i className="ai-weave__b" />
      </span>
    </span>
  );
}

/** Screen-space chrome for one frame: label above, outline and resize handles. */
export function FrameChrome({ rect, name, size, scope, device, tip, active, fitPage, onActivate, onDragStart, onRename, onResizeStart, onZoom, menuOpen, onMenu, menu, working }) {
  return (
    <div className={cx('frame-chrome', active && 'is-active')} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
      <div className="frame-chrome__label" onPointerDown={onDragStart} onClick={onActivate} onDoubleClick={onRename}>
        {typeof name === 'string' ? (
          <span className="frame-chrome__device" title={tip ?? name} aria-label={tip ?? name}>
            {(() => { const Icon = DEVICE_ICON[device] ?? Frame; return <Icon size={14} aria-hidden="true" />; })()}
          </span>
        ) : (
          <span className="frame-chrome__name">{name}</span>
        )}
        {size && <span className="frame-chrome__size">{size}</span>}
        {onZoom && (
          <IconButton
            size="sm"
            label="Zoom to this frame"
            className="frame-chrome__menu frame-chrome__zoom"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onZoom();
            }}
          >
            <Focus size={13} />
          </IconButton>
        )}
        <IconButton
          size="sm"
          label={`${typeof name === 'string' ? name : 'Frame'} options`}
          className="frame-chrome__menu"
          active={menuOpen}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onMenu?.();
          }}
        >
          <MoreHorizontal size={13} />
        </IconButton>
        {menu}
      </div>
      <div className="frame-chrome__outline" />
      <div className="frame-chrome__handle frame-chrome__handle--e" onPointerDown={(e) => onResizeStart?.(e, 'e')} />
      {!fitPage && <div className="frame-chrome__handle frame-chrome__handle--s" onPointerDown={(e) => onResizeStart?.(e, 's')} />}
      <div className={cx('frame-chrome__handle', fitPage ? 'frame-chrome__handle--e-end' : 'frame-chrome__handle--se')} onPointerDown={(e) => onResizeStart?.(e, fitPage ? 'e' : 'se')} />
    </div>
  );
}

export function FrameRename({ value, onCommit, onCancel }) {
  return (
    <input
      className="frame-chrome__rename"
      autoFocus
      defaultValue={value}
      aria-label="Frame name"
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(e.currentTarget.value);
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

/** Smart guides, already converted to screen coordinates. */
export function Guides({ lines }) {
  return lines.map((g, i) =>
    g.axis === 'x' ? (
      <div key={i} className="guide guide--x" style={{ left: g.at, top: g.from, height: g.to - g.from }} />
    ) : (
      <div key={i} className="guide guide--y" style={{ top: g.at, left: g.from, width: g.to - g.from }} />
    ),
  );
}

export function SizeTip({ x, y, children }) {
  return (
    <div className="size-tip" style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

/** Contextual actions that float above the selected element. */
export function SelectionBar({ x, y, below, children }) {
  return (
    <div className={cx('selection-bar', below && 'is-below')} style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

/** Overview of every frame plus the visible area; click or drag to move there. */
export function Minimap({ frames, view, width = 176, height = 112, onNavigate }) {
  const all = [...frames, view];
  const minX = Math.min(...all.map((r) => r.x));
  const minY = Math.min(...all.map((r) => r.y));
  const maxX = Math.max(...all.map((r) => r.x + r.width));
  const maxY = Math.max(...all.map((r) => r.y + r.height));
  const pad = 8;
  const scale = Math.min((width - pad * 2) / Math.max(maxX - minX, 1), (height - pad * 2) / Math.max(maxY - minY, 1));
  const ox = pad + ((width - pad * 2) - (maxX - minX) * scale) / 2;
  const oy = pad + ((height - pad * 2) - (maxY - minY) * scale) / 2;
  const toMap = (r) => ({ x: ox + (r.x - minX) * scale, y: oy + (r.y - minY) * scale, width: Math.max(r.width * scale, 2), height: Math.max(r.height * scale, 2) });
  const toWorld = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - box.left - ox) / scale + minX, y: (e.clientY - box.top - oy) / scale + minY };
  };
  const v = toMap(view);
  return (
    <svg
      className="minimap"
      width={width}
      height={height}
      role="img"
      aria-label="Minimap"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onNavigate?.(toWorld(e));
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) onNavigate?.(toWorld(e));
      }}
    >
      {frames.map((f) => {
        const r = toMap(f);
        return <rect key={f.id} className={cx('minimap__frame', f.active && 'is-active')} x={r.x} y={r.y} width={r.width} height={r.height} rx={1} />;
      })}
      <rect className="minimap__view" x={v.x} y={v.y} width={v.width} height={v.height} rx={2} />
    </svg>
  );
}

/** Bottom-corner navigation: zoom, fit, scroll sync and layout history. */
export function CanvasNav({ zoom, onZoomIn, onZoomOut, onReset, onFitAll, onFitSelection, syncScroll, onSyncScroll, canUndo, canRedo, onUndo, onRedo, minimap, minimapOpen, onToggleMinimap, canvasBg }) {
  return (
    <div className="canvas-nav canvas-nav--parked">
      {minimapOpen && minimap && <div className="canvas-nav__minimap">{minimap}</div>}
      <div className="canvas-nav__bar">
        {canvasBg}
        {canvasBg ? <span className="canvas-nav__sep" /> : null}
        <IconButton size="sm" tipSide="top" label="Undo layout change" disabled={!canUndo} onClick={onUndo}>
          <Undo2 size={13} />
        </IconButton>
        <IconButton size="sm" tipSide="top" label="Redo layout change" disabled={!canRedo} onClick={onRedo}>
          <Redo2 size={13} />
        </IconButton>
        <span className="canvas-nav__sep" />
        <IconButton size="sm" tipSide="top" label="Sync scrolling" active={syncScroll} aria-pressed={syncScroll} onClick={onSyncScroll}>
          <Link2 size={13} />
        </IconButton>
        <IconButton size="sm" tipSide="top" label="Minimap" active={minimapOpen} aria-pressed={minimapOpen} onClick={onToggleMinimap}>
          <ScanSearch size={13} />
        </IconButton>
        <span className="canvas-nav__sep" />
        <IconButton size="sm" tipSide="top" label="Fit selection" onClick={onFitSelection}>
          <Focus size={13} />
        </IconButton>
        <IconButton size="sm" tipSide="top" label="Fit all frames" onClick={onFitAll}>
          <Maximize size={13} />
        </IconButton>
        <IconButton size="sm" tipSide="top" label="Zoom out" onClick={onZoomOut}>
          <Minus size={13} />
        </IconButton>
        <button className="canvas-nav__zoom" aria-label="Reset zoom to 100%" data-tip="Reset to 100%" data-tip-side="top" onClick={onReset}>
          {zoom}
        </button>
        <IconButton size="sm" tipSide="top" label="Zoom in" onClick={onZoomIn}>
          <Plus size={13} />
        </IconButton>
      </div>
    </div>
  );
}
