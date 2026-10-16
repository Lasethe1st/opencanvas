import { ChevronDown, ChevronRight, PanelLeftClose, PanelRightClose, Search } from 'lucide-react';
import { cx } from './primitives.jsx';

export function Panel({ side, width, head, children, resizer, hidden, onCollapse, ...rest }) {
  const Icon = side === 'left' ? PanelLeftClose : PanelRightClose;
  return (
    <aside className={cx('panel', `panel--${side}`, hidden && 'is-hidden')} style={{ width }} aria-hidden={hidden || undefined} inert={hidden ? '' : undefined} {...rest}>
      {head && (
        <div className="panel__head">
          {head}
          {onCollapse && (
            <button type="button" className="icon-btn icon-btn--sm panel__collapse" aria-label="Hide panel" data-tip="Hide panels  Ctrl+\\" data-tip-side={side === 'left' ? 'right' : 'left'} onClick={onCollapse}>
              <Icon size={14} />
            </button>
          )}
        </div>
      )}
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
      <input value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange?.(e.target.value)} />
    </label>
  );
}

export function Tree({ children }) {
  const onKeyDown = (e) => {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.altKey || !e.target.classList?.contains('tree-row')) return;
    const rows = [...e.currentTarget.querySelectorAll('.tree-row[tabindex]')];
    const next = rows[rows.indexOf(e.target) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus();
  };
  return (
    <div className="tree" role="tree" onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

export function TreeRow({ depth = 0, icon, name, meta, active, hovered, expandable, expanded, onToggle, actions, trailing, className, children, ...rest }) {
  const onKeyDown = (e) => {
    rest.onKeyDown?.(e);
    if (e.defaultPrevented || e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      rest.onClick?.(e);
    } else if (expandable && ((e.key === 'ArrowRight' && !expanded) || (e.key === 'ArrowLeft' && expanded))) {
      e.preventDefault();
      onToggle?.();
    }
  };
  return (
    <div
      className={cx('tree-row', active && 'is-active', hovered && 'is-hovered', className)}
      style={{ paddingLeft: 4 + depth * 14 }}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expandable ? !!expanded : undefined}
      aria-selected={!!active}
      tabIndex={rest.onClick ? 0 : undefined}
      {...rest}
      onKeyDown={onKeyDown}
    >
      <button
        className="tree-row__toggle"
        tabIndex={-1}
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
