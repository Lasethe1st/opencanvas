import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const HOME_RIGHT_PANEL_WIDTH = 250;
/** Extra width the panel gains while a file is open — total open width is 790. */
export const HOME_RIGHT_PANEL_FILE_WIDTH = 540;

/** Docked home right column — stays open while switching tabs; body fades. */
export function HomeRightPanel({
  open,
  title,
  contentKey,
  flush,
  file,
  children,
}: {
  open: boolean;
  title: string;
  /** Changes when the body should fade (panel tab or nested view). */
  contentKey: string;
  /** Drop body padding — for full-bleed nested views like ProjectSetup. */
  flush?: boolean;
  /** A file viewer. Appears to the right of the list and widens the panel. */
  file?: ReactNode;
  children: ReactNode;
}) {
  const width = HOME_RIGHT_PANEL_WIDTH + (file ? HOME_RIGHT_PANEL_FILE_WIDTH : 0);
  return (
    <aside
      data-tw=""
      aria-hidden={!open}
      inert={!open}
      aria-label={open ? title : undefined}
      className={cn(
        'relative z-0 flex h-full shrink-0 flex-col overflow-hidden',
        'motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]',
      )}
      style={{ width: open ? width : 0 }}
    >
      <div className="flex h-full flex-row" style={{ width, pointerEvents: open ? 'auto' : 'none' }}>
        <div className="flex h-full shrink-0 flex-col" style={{ width: HOME_RIGHT_PANEL_WIDTH }}>
        {open && (
          <div
            key={contentKey}
            className={cn(
              'min-h-0 flex-1 overscroll-contain motion-safe:animate-[fade-in_0.18s_ease-out]',
              flush ? 'flex flex-col overflow-hidden' : 'overflow-y-auto py-2 pe-2 ps-0',
            )}
          >
            {children}
          </div>
        )}
        </div>
        {open && file && <div className="flex h-full min-w-0 flex-1 flex-col motion-safe:animate-[fade-in_0.18s_ease-out]">{file}</div>}
      </div>
    </aside>
  );
}
