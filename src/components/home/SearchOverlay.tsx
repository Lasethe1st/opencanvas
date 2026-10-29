import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** A centred search box over a dimmed page. Escape or a click outside closes it; focus returns to where it was. */
export function SearchOverlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const frame = requestAnimationFrame(() => card.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus());
    return () => {
      cancelAnimationFrame(frame);
      root?.removeAttribute('inert');
      opener?.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div data-tw="" className="fixed inset-0 z-[100] grid place-items-start justify-items-center overflow-y-auto bg-overlay p-4 pt-[14vh] motion-safe:animate-[fade-in_0.15s_ease-out]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onKeyDown={onKeyDown}
        className="max-h-[70vh] w-full max-w-[450px] overflow-y-auto overscroll-contain rounded-[24px] border border-border bg-card/80 px-2 pb-2 pt-0 text-foreground shadow-[var(--shadow-lg)] backdrop-blur-[20px] backdrop-saturate-150 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
