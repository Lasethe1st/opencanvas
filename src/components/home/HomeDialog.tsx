import { Minus, X } from '@phosphor-icons/react';
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
  minimizeTarget,
  progress,
  footer,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onMinimize?: () => void;
  /** Where the dialog shrinks toward when minimized (the chip's spot). */
  minimizeTarget?: () => DOMRect | null;
  /** Form progress, drawn as a thin bar under the header. */
  progress?: { value: number; max: number };
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const backdrop = useRef<HTMLDivElement>(null);

  // Shrink toward the chip, then hand over. Reduced motion skips straight to it.
  const minimize = () => {
    const el = card.current;
    const target = minimizeTarget?.();
    if (!el || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onMinimize?.();
      return;
    }
    const box = el.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (box.left + box.width / 2);
    const dy = target.top + target.height / 2 - (box.top + box.height / 2);
    const timing = { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' as const };
    backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], timing);
    el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0 }], timing).finished.then(() => onMinimize?.(), () => onMinimize?.());
  };

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
    <div ref={backdrop} data-tw="" className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-overlay p-4 motion-safe:animate-[fade-in_0.15s_ease-out]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={`flex max-h-[min(640px,calc(100dvh-2rem))] w-full flex-col overflow-hidden rounded-[15px] border border-foreground/[0.08] bg-[color-mix(in_srgb,var(--home-card)_80%,transparent)] text-foreground shadow-[var(--shadow-md)] backdrop-blur-[20px] backdrop-saturate-150 motion-safe:animate-[home-dialog-in_0.18s_cubic-bezier(0.2,0,0,1)] ${wide ? 'max-w-[600px]' : 'max-w-[450px]'}`}
        style={{ WebkitBackdropFilter: 'blur(20px) saturate(1.5)' }}
      >
        <header className="flex shrink-0 items-center gap-1 px-2 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 truncate text-[18px] font-medium tracking-[-0.01rem]">
              {title}
            </h2>
            {subtitle && <p className="m-0 truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {onMinimize && (
            <Button variant="ghost" size="icon-sm" className="rounded-[8px] text-muted-foreground hover:text-foreground" aria-label="Minimize" title="Minimize" onClick={minimize}>
              <Minus />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="rounded-[8px] text-muted-foreground hover:text-foreground" aria-label="Close" title="Close" onClick={onClose}>
            <X />
          </Button>
        </header>
        {progress && (
          <div role="progressbar" aria-label={`Step ${progress.value} of ${progress.max}`} aria-valuemin={0} aria-valuemax={progress.max} aria-valuenow={progress.value} className="mx-5 mb-2 h-0.5 shrink-0 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-foreground motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]" style={{ width: `${(progress.value / progress.max) * 100}%` }} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-0">{children}</div>
        {footer && <footer className="flex shrink-0 items-center gap-2 border-t border-foreground/[0.08] px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
