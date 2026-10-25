import { ChevronDown, ChevronRight, Code2, Maximize2, Minimize2, Monitor, MousePointer2, Play, Smartphone, Tablet } from 'lucide-react';
import { Badge, IconButton, Segmented } from './primitives.jsx';

export const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', icon: <Monitor size={14} /> },
  { id: 'tablet', label: 'Tablet', icon: <Tablet size={14} /> },
  { id: 'mobile', label: 'Mobile', icon: <Smartphone size={14} /> },
];

export function Brand() {
  return (
    <div data-oc="div-tyuk7" className="brand" title="OpenCanvas">
      <svg className="brand__mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="1" y="1" width="18" height="18" rx="6" fill="var(--accent)" />
        <rect x="6" y="6" width="8" height="8" rx="2.5" fill="none" stroke="var(--accent-fg)" strokeWidth="1.75" />
      </svg>
      <span className="sr-only">OpenCanvas</span>
    </div>
  );
}

export function ProjectButton({ name, onClick }) {
  return (
    <button className="project-btn" onClick={onClick} title={name}>
      <span className="project-btn__name">{name}</span>
      <ChevronDown size={13} />
    </button>
  );
}

export function SaveStatus({ state }) {
  if (state === 'saving') return <Badge tone="busy">Saving…</Badge>;
  if (state === 'dirty') return <Badge tone="warning">Unsaved changes</Badge>;
  return null;
}

export function Breadcrumb({ items, onSelect }) {
  return (
    <nav className="crumbs" aria-label="Selection path">
      {items.map((item, i) => (
        <span key={item.key ?? i} style={{ display: 'inline-flex', alignItems: 'center' }}>
          {i > 0 && <ChevronRight size={12} />}
          <button className={i === items.length - 1 ? 'is-current' : ''} onClick={() => onSelect?.(item)}>
            {item.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

export function ViewportSwitch({ value, onChange, width }) {
  return (
    <>
      <Segmented label="Viewport" options={VIEWPORTS} value={value} onChange={onChange} />
      <span className="viewport-width">{width}</span>
    </>
  );
}

export function ModeSwitch({ value, onChange }) {
  return (
    <Segmented
      label="Editor mode"
      options={[
        { id: 'visual', label: 'Visual', icon: <MousePointer2 size={15} /> },
        { id: 'code', label: 'Code', icon: <Code2 size={15} /> },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

export function PreviewButton({ onClick }) {
  return (
    <IconButton label="Preview full screen" onClick={onClick}>
      <Play size={15} />
    </IconButton>
  );
}

/** One control for both side panels: expand the canvas to full screen, or bring the panels back. */
export function PanelsButton({ hidden, onClick }) {
  return (
    <IconButton label={hidden ? 'Show panels' : 'Hide panels'} aria-pressed={hidden} onClick={onClick}>
      {hidden ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
    </IconButton>
  );
}

export function TopBar({ start, center, end }) {
  return (
    <header className="topbar">
      <div className="topbar__side">{start}</div>
      {center ? <div className="topbar__center">{center}</div> : null}
      <div className="topbar__side topbar__side--end">{end}</div>
    </header>
  );
}

export function Divider() {
  return <span className="divider" />;
}
