import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const HOME_RIGHT_PANEL_WIDTH = 200;

/** Docked home right column — stays open while switching tabs; body fades. */
export function HomeRightPanel({
  open,
  title,
  contentKey,
  flush,
  children,
}: {
  open: boolean;
  title: string;
  /** Changes when the body should fade (panel tab or nested view). */
  contentKey: string;
  /** Drop body padding — for full-bleed nested views like ProjectSetup. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <aside
      data-tw=""
      aria-hidden={!open}
      inert={!open}
      aria-label={open ? title : undefined}
      className={cn(
        'relative z-0 flex h-full shrink-0 flex-col overflow-hidden',
        'motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]',
        open ? "w-[200px]" : "w-0",
      )}
    >
      <div className="flex h-full w-[200px] flex-col" style={{ pointerEvents: open ? 'auto' : 'none' }}>
        {open && (
          <div
            key={contentKey}
            className={cn(
              'min-h-0 flex-1 overscroll-contain motion-safe:animate-[fade-in_0.18s_ease-out]',
              flush ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-2',
            )}
          >
            {children}
          </div>
        )}
      </div>
    </aside>
  );
}
