import { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { IconButton } from './primitives.jsx';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, onClose, children, ...rest }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement;
    const node = ref.current;
    // Focus the first control in the body (fall back to the dialog itself) so keyboard users land inside.
    const first = node?.querySelector(`.dialog__body :is(${FOCUSABLE})`) || node;
    first?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === head || !node.contains(document.activeElement))) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (document.activeElement === tail || !node.contains(document.activeElement))) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} {...rest}>
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
