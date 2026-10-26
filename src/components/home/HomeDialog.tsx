import { Minus, X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

/**
 * A centred dialog over a dimmed page. Escape or the close button closes it; focus returns to the opener.
 * With `onMinimize`, a second button tucks it away without losing its state.
 */
export function HomeDialog({
  title,
  subtitle,
  onClose,
  onMinimize,
  footer,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onMinimize?: () => void;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const frame = requestAnimationFrame(() => (card.current?.querySelector<HTMLElement>('[data-autofocus]') ?? card.current?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      root?.removeAttribute('inert');
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    // Keep Tab inside the dialog.
    if (e.key === 'Tab' && card.current) {
      const nodes = [...card.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return createPortal(
    <div data-tw="" className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-overlay p-4 motion-safe:animate-[fade-in_0.15s_ease-out]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={`flex max-h-[min(640px,calc(100dvh-2rem))] w-full flex-col overflow-hidden rounded-[15px] border border-foreground/[0.08] bg-[var(--home-card)] text-foreground ${wide ? 'max-w-[600px]' : 'max-w-[520px]'}`}
      >
        <header className="flex shrink-0 items-center gap-2 py-3 ps-5 pe-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 truncate text-sm font-medium">
              {title}
            </h2>
            {subtitle && <p className="m-0 truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {onMinimize && (
            <Button variant="ghost" size="icon-sm" className="rounded-[8px] text-muted-foreground hover:text-foreground" aria-label="Minimize" title="Minimize" onClick={onMinimize}>
              <Minus strokeWidth={2} />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="rounded-[8px] text-muted-foreground hover:text-foreground" aria-label="Close" title="Close" onClick={onClose}>
            <X strokeWidth={2} />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-1">{children}</div>
        {footer && <footer className="flex shrink-0 items-center gap-2 border-t border-foreground/[0.08] px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
