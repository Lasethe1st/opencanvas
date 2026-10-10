import { X } from 'lucide-react';
import { cx } from './primitives.jsx';

export function CodeView({ tabs, actions, editor, status, ...rest }) {
  return (
    <section className="code-view" aria-label="Code editor" {...rest}>
      <div className="code-tabs" role="tablist">
        {tabs}
        <div className="code-tabs__actions">{actions}</div>
      </div>
      <div className="code-view__editor">{editor}</div>
      <div className="code-status">{status}</div>
    </section>
  );
}

export function CodeTab({ name, title, active, dirty, onSelect, onClose }) {
  return (
    <div className={cx('code-tab', active && 'is-active')} role="tab" aria-selected={active} title={title} onClick={onSelect}>
      {name}
      {dirty && <span className="dirty-dot" title="Unsaved" />}
      <button className="icon-btn icon-btn--sm" aria-label={`Close ${title}`} onClick={(e) => { e.stopPropagation(); onClose?.(); }}>
        <X size={12} />
      </button>
    </div>
  );
}
