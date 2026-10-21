import { ChevronDown, ChevronRight, Icon, Search } from '@/components/lime/icon';
import { Button } from '@/components/lime/ui/button';
import { Field, FieldLabel } from '@/components/lime/ui/field';
import { Input } from '@/components/lime/ui/input';
import { cn } from '@/lib/lime/utils';

export function Panel({ side, width, head, children, resizer, hidden, ...rest }) {
  const w = typeof width === 'number' ? `${width}px` : width;
  return (
    <aside
      className={cn(
        'flex h-full w-(--panel-w) shrink-0 flex-col border-line bg-surface text-fg',
        side === 'left' ? 'border-e' : 'border-s',
        hidden && 'pointer-events-none invisible',
      )}
      style={{ '--panel-w': w }}
      aria-hidden={hidden || undefined}
      inert={hidden ? '' : undefined}
      {...rest}
    >
      {head && <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">{head}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {resizer}
    </aside>
  );
}

export function PanelTitle({ children }) {
  return <span className="text-sm font-semibold text-fg">{children}</span>;
}

export function Rail({ side, children }) {
  return <div className={cn('flex flex-col', side === 'left' ? 'items-start' : 'items-end')}>{children}</div>;
}

export function SearchField({ value, onChange, placeholder = 'Search' }) {
  return (
    <Field name="panelSearch" className="px-2 py-2">
      <FieldLabel className="sr-only">{placeholder}</FieldLabel>
      <div className="flex items-center gap-2">
        <Icon icon={Search} size={16} className="shrink-0 text-fg-3" />
        <Input className="min-w-0 flex-1" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange?.(e.target.value)} />
      </div>
    </Field>
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
    <div className="tree flex flex-col" role="tree" onKeyDown={onKeyDown}>
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
      className={cn(
        'tree-row group flex min-h-9 items-center gap-1 rounded-md pe-1 text-sm text-fg hover:bg-surface-2 focus-visible:-outline-offset-2 ps-(--tree-depth)',
        active && 'bg-accent-wash',
        hovered && 'bg-surface-2',
        className,
      )}
      style={{ '--tree-depth': `${4 + depth * 14}px` }}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expandable ? !!expanded : undefined}
      aria-selected={!!active}
      tabIndex={rest.onClick ? 0 : undefined}
      {...rest}
      onKeyDown={onKeyDown}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(!expandable && 'invisible')}
        tabIndex={-1}
        aria-label={expanded ? 'Collapse' : 'Expand'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
      >
        <Icon icon={expanded ? ChevronDown : ChevronRight} size={12} />
      </Button>
      {icon}
      {children ?? <span className="min-w-0 flex-1 truncate">{name}</span>}
      {trailing}
      {meta && <span className="shrink-0 text-xs text-fg-3">{meta}</span>}
      {actions && <span className="ms-auto flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">{actions}</span>}
    </div>
  );
}

export function Resizer({ onPointerDown, dragging }) {
  return (
    <div
      className={cn('panel__resizer absolute inset-y-0 w-1 cursor-col-resize', dragging && 'is-dragging')}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
