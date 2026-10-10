import { ChevronDown, ChevronRight, Code2, Download, Monitor, MousePointer2, Play, Redo2, Smartphone, Tablet, Undo2 } from 'lucide-react';
import { Badge, Button, IconButton, Segmented } from './primitives.jsx';

export const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', icon: <Monitor size={14} /> },
  { id: 'tablet', label: 'Tablet', icon: <Tablet size={14} /> },
  { id: 'mobile', label: 'Mobile', icon: <Smartphone size={14} /> },
];

export function Brand() {
  return (
    <div data-oc="div-tyuk7" className="brand">
      <span className="brand__mark" aria-hidden />
      OpenCanvas
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
  return <Badge>Saved</Badge>;
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
        { id: 'visual', label: 'Visual', text: 'Visual', icon: <MousePointer2 size={13} /> },
        { id: 'code', label: 'Code', text: 'Code', icon: <Code2 size={13} /> },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

export function InteractToggle({ active, onClick }) {
  return (
    <IconButton label={active ? 'Back to selecting' : 'Preview: interact with the page'} active={active} onClick={onClick}>
      {active ? <MousePointer2 size={15} /> : <Play size={15} />}
    </IconButton>
  );
}

export function HistoryButtons({ canUndo, canRedo, onUndo, onRedo }) {
  return (
    <>
      <IconButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={15} />
      </IconButton>
      <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
        <Redo2 size={15} />
      </IconButton>
    </>
  );
}

export function ExportButton({ onClick }) {
  return (
    <Button variant="primary" icon={<Download size={14} />} onClick={onClick} className="export-btn">
      Export
    </Button>
  );
}

export function TopBar({ start, center, end }) {
  return (
    <header className="topbar">
      <div className="topbar__side">{start}</div>
      <div>{center}</div>
      <div className="topbar__side topbar__side--end">{end}</div>
    </header>
  );
}

export function Divider() {
  return <span className="divider" />;
}
