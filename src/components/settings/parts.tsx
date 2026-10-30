import type { ReactNode } from 'react';
import { cx } from '../../ui/primitives.jsx';

/** A titled card of setting rows. */
export function SettingsGroup({ title, hint, action, children }: { title?: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="sx-group">
      {(title || action) && (
        <header className="sx-group__head">
          {title && <h3>{title}</h3>}
          {action}
        </header>
      )}
      <div className="sx-card">{children}</div>
      {hint && <p className="sx-hint">{hint}</p>}
    </section>
  );
}

/** One setting: name and helper text on the left, its control on the right. `stack` puts the control underneath. */
export function SettingRow({ label, hint, stack, children, className }: { label: ReactNode; hint?: ReactNode; stack?: boolean; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('sx-row', stack && 'is-stack', className)}>
      <div className="sx-row__text">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      {children && <div className="sx-row__control">{children}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="sx-switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden />
    </label>
  );
}
