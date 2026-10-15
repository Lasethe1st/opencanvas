import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { IconButton } from './primitives.jsx';

export function Dialog({ title, onClose, children, ...rest }) {
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} {...rest}>
        <div className="dialog__head">
          <h2>{title}</h2>
          <IconButton size="sm" label="Close" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  );
}

export function ExportOption({ icon, title, children, ...rest }) {
  return (
    <button className="export-option" {...rest}>
      <span className="export-option__icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        {children}
      </span>
    </button>
  );
}

const TOAST_ICON = {
  info: <Info size={15} className="toast__icon" />,
  success: <CheckCircle2 size={15} className="toast__icon" />,
  error: <AlertCircle size={15} className="toast__icon" />,
};

export function Toasts({ toasts }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          {TOAST_ICON[t.kind]}
          {t.message}
        </div>
      ))}
    </div>
  );
}
