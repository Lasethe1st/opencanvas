import { ChevronDown, RotateCcw } from 'lucide-react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Button({ variant = 'default', size, icon, children, className, ...rest }) {
  return (
    <button className={cx('btn', variant !== 'default' && `btn--${variant}`, size === 'sm' && 'btn--sm', className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, tipSide, active, size, children, className, ...rest }) {
  return (
    <button className={cx('icon-btn', size === 'sm' && 'icon-btn--sm', active && 'is-active', className)} aria-label={label} data-tip={label} data-tip-side={tipSide} {...rest}>
      {children}
    </button>
  );
}

export function Segmented({ label, options, value, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} aria-label={o.label} data-tip={o.icon && !o.text ? o.label : undefined} className={value === o.id ? 'is-active' : ''} onClick={() => onChange?.(o.id)}>
          {o.icon}
          {o.text}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone, children }) {
  return (
    <span className={cx('badge', tone && `badge--${tone}`)}>
      <span className="badge__dot" />
      {children}
    </span>
  );
}

export function Section({ title, open = true, onToggle, children }) {
  return (
    <div className="section">
      <button data-oc="button-xwrpr" className={cx('section__head', !open && 'is-collapsed')} onClick={onToggle} aria-expanded={open}>
        <ChevronDown size={14} />
        {title}
      </button>
      {open && <div className="section__body">{children}</div>}
    </div>
  );
}

export function Field({ label, state, children }) {
  return (
    <label className="field">
      <span className="field__label">
        {state === 'set' && <span className="marker marker--set" />}
        {state === 'inherited' && <span className="marker marker--inherited" />}
        {label}
      </span>
      {children}
    </label>
  );
}

export function InputShell({ inherited, prefix, onReset, children }) {
  return (
    <span className={cx('input', inherited && 'is-inherited')}>
      {prefix && <span className="input__prefix">{prefix}</span>}
      {children}
      {onReset && (
        <button className="input__reset" aria-label="Remove override" data-tip="Remove override" onClick={onReset}>
          <RotateCcw size={11} />
        </button>
      )}
    </span>
  );
}

export function SelectShell({ inherited, onReset, children }) {
  return (
    <span className={cx('input', inherited && 'is-inherited')}>
      {children}
      {!onReset && <ChevronDown size={13} className="input__chevron" />}
      {onReset && (
        <button className="input__reset" aria-label="Remove override" onClick={onReset}>
          <RotateCcw size={11} />
        </button>
      )}
    </span>
  );
}

export function Swatch({ color, children }) {
  return (
    <span className="swatch" style={{ background: color || 'transparent' }}>
      {children}
    </span>
  );
}

export function ToggleRow({ options, value, onChange }) {
  return (
    <div className="toggle-row">
      {options.map((o) => (
        <button key={o.value} title={o.title} aria-label={o.title} className={value === o.value ? 'is-active' : ''} onClick={() => onChange?.(o.value)}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}

export function SectionLabel({ children, actions }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {actions && <span style={{ display: 'flex', gap: 2 }}>{actions}</span>}
    </div>
  );
}

export function Notice({ tone, icon, children, action }) {
  return (
    <div className={cx('notice', tone && `notice--${tone}`)} role="status">
      {icon}
      <div className="notice__body">{children}</div>
      {action}
    </div>
  );
}

export function Menu({ style, children, ...rest }) {
  return (
    <div className="popover" role="menu" style={style} {...rest}>
      {children}
    </div>
  );
}

export function MenuItem({ icon, hint, children, ...rest }) {
  return (
    <button className="menu-item" role="menuitem" {...rest}>
      {icon}
      {children}
      {hint && <span className="menu-item__hint">{hint}</span>}
    </button>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export { cx };
