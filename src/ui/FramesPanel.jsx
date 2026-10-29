import { Monitor, Smartphone, Square, Tablet } from '../lib/hugeicons';
import { cx } from './primitives.jsx';

const ICONS = { base: Monitor, tablet: Tablet, mobile: Smartphone };

/** One frame (or page) in the Frames tab: icon, name and a meta line such as dimensions and scope. */
export function FrameRow({ name, size, scope, scopeLabel, meta, icon: IconOverride, active, actions, onClick, onDoubleClick, onKeyDown, children, ...rest }) {
  const Icon = IconOverride ?? ICONS[scope] ?? Square;
  return (
    <div
      className={cx('frame-row', active && 'is-active')}
      tabIndex={0}
      aria-current={active || undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e);
        } else if (e.key === 'F2') {
          e.preventDefault();
          onDoubleClick?.(e);
        } else onKeyDown?.(e);
      }}
      {...rest}
    >
      <Icon size={14} className="frame-row__icon" />
      <span className="frame-row__text">
        {children ?? <span className="frame-row__name">{name}</span>}
        <span className="frame-row__meta">{meta ?? `${size} · ${scopeLabel}`}</span>
      </span>
      {actions && <span className="frame-row__actions">{actions}</span>}
    </div>
  );
}
