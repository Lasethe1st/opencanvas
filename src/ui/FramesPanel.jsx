import { Monitor, Smartphone, Square, Tablet } from 'lucide-react';
import { cx } from './primitives.jsx';

const ICONS = { base: Monitor, tablet: Tablet, mobile: Smartphone };

/** One frame in the Frames tab: scope icon, name, dimensions and scope label. */
export function FrameRow({ name, size, scope, scopeLabel, active, actions, onClick, onDoubleClick, children, ...rest }) {
  const Icon = ICONS[scope] ?? Square;
  return (
    <div className={cx('frame-row', active && 'is-active')} onClick={onClick} onDoubleClick={onDoubleClick} {...rest}>
      <Icon size={14} className="frame-row__icon" />
      <span className="frame-row__text">
        {children ?? <span className="frame-row__name">{name}</span>}
        <span className="frame-row__meta">
          {size} · {scopeLabel}
        </span>
      </span>
      {actions && <span className="frame-row__actions">{actions}</span>}
    </div>
  );
}
