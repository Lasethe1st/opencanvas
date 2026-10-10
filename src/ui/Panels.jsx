import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { cx } from './primitives.jsx';

export function Panel({ side, width, head, children, resizer, ...rest }) {
  return (
    <aside className={cx('panel', `panel--${side}`)} style={{ width }} {...rest}>
      {head && <div className="panel__head">{head}</div>}
      <div className="panel__body">{children}</div>
      {resizer}
    </aside>
  );
}

export function PanelTitle({ children }) {
  return <span className="panel__title">{children}</span>;
}

export function Rail({ side, children }) {
  return <div className={cx('rail', `rail--${side}`)}>{children}</div>;
}

export function SearchField({ value, onChange, placeholder = 'Search' }) {
  return (
    <label className="search">
      <Search size={13} />
      <input value={value} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} />
    </label>
  );
}

export function Tree({ children }) {
  return <div className="tree">{children}</div>;
}

export function TreeRow({ depth = 0, icon, name, meta, active, hovered, expandable, expanded, onToggle, actions, trailing, className, children, ...rest }) {
  return (
    <div className={cx('tree-row', active && 'is-active', hovered && 'is-hovered', className)} style={{ paddingLeft: 4 + depth * 14 }} {...rest}>
      <button
        className="tree-row__toggle"
        style={{ visibility: expandable ? 'visible' : 'hidden' }}
        aria-label={expanded ? 'Collapse' : 'Expand'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {icon}
      {children ?? <span className="tree-row__name">{name}</span>}
      {trailing}
      {meta && <span className="tree-row__meta">{meta}</span>}
      {actions && <span className="tree-row__actions">{actions}</span>}
    </div>
  );
}

export function Resizer({ onPointerDown, dragging }) {
  return <div className={cx('panel__resizer', dragging && 'is-dragging')} onPointerDown={onPointerDown} role="separator" aria-orientation="vertical" />;
}
