import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface MorphPillItem {
  id: string;
  /** Accessible name and tooltip for the rail icon. */
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Heading in the expanded state. Defaults to the label. */
  title?: string;
  content: ReactNode;
  /** Draw a divider above this item. */
  dividerBefore?: boolean;
}

/** Compact width: one 40px icon button with 6px of padding each side. */
const RAIL_WIDTH = 52;
/** The pill's radius. Half the compact width, so the compact state is a true pill and the expanded state keeps the same corners. */
const RADIUS = 26;
const SIZE_MS = 300;

/**
 * One component, two states. Compact: a slim vertical rail of icons. Expanded: the same surface grows to hold the content
 * of the selected item. Switching items resizes it in place, and the rail never moves.
 *
 * Both sizes are explicit so width and height can transition. The rail's and the content's natural sizes are measured.
 */
export function MorphPill({
  label,
  items,
  active,
  onActiveChange,
  expandedWidth = 340,
  footer,
  busy,
  className,
}: {
  /** Accessible name of the rail (a navigation landmark). */
  label: string;
  items: MorphPillItem[];
  /** The expanded item's id, or null when compact. */
  active: string | null;
  onActiveChange: (id: string | null) => void;
  expandedWidth?: number;
  /** Rail content below a divider, such as a theme menu. */
  footer?: ReactNode;
  /** While true, Escape does not collapse the pill. */
  busy?: boolean;
  className?: string;
}) {
  const panelId = useId();
  const open = active !== null;
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [railH, setRailH] = useState<number | null>(null);
  const [bodyH, setBodyH] = useState(0);

  // Keep the last item's content mounted until the pill has finished collapsing.
  const [shownId, setShownId] = useState<string | null>(active);
  useEffect(() => {
    if (active) {
      setShownId(active);
      return;
    }
    const timer = setTimeout(() => setShownId(null), SIZE_MS);
    return () => clearTimeout(timer);
  }, [active]);
  const shown = items.find((item) => item.id === shownId);

  useLayoutEffect(() => {
    const node = railRef.current;
    if (!node) return;
    const measure = () => setRailH(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!body) return;
    const measure = () => setBodyH(body.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [body]);

  // Opening, or switching item, moves focus to the content's primary field.
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [active]);

  // Escape collapses the pill and returns focus to the rail icon that opened it.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || busy || document.querySelector('[role="menu"]')) return;
      e.preventDefault();
      onActiveChange(null);
      buttons.current[active]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, busy, onActiveChange]);

  const height = railH === null ? undefined : open ? Math.max(railH, bodyH) : railH;

  return (
    <div
      data-tw=""
      data-slot="morph-pill"
      data-state={open ? 'expanded' : 'compact'}
      className={cn(
        'overflow-hidden border border-transparent bg-card shadow-[0_0_0_1px_var(--line),var(--shadow-lg)] max-h-[calc(100%-32px)]',
        // Resize only for people who allow motion. Otherwise the size changes at once and the content cross-fades.
        'motion-safe:transition-[width,height] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]',
        className,
      )}
      style={{ width: open ? expandedWidth : RAIL_WIDTH, height, borderRadius: RADIUS }}
    >
      <div className="flex h-full items-start">
        <nav ref={railRef} aria-label={label} className="flex shrink-0 flex-col items-center gap-1 p-1.5" style={{ width: RAIL_WIDTH }}>
          {items.map((item) => {
            const isActive = item.id === active;
            return (
              <div key={item.id} className="flex w-full flex-col items-center gap-1">
                {item.dividerBefore && <Separator className="my-1 w-6" />}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      ref={(node) => {
                        buttons.current[item.id] = node;
                      }}
                      variant="ghost"
                      className={cn('size-10 rounded-full [&_svg]:size-5', isActive && 'bg-secondary')}
                      aria-label={item.label}
                      aria-expanded={isActive}
                      aria-controls={isActive ? panelId : undefined}
                      onClick={() => onActiveChange(isActive ? null : item.id)}
                    >
                      <item.icon strokeWidth={2} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
          {footer && (
            <>
              <Separator className="my-1 w-6" />
              {footer}
            </>
          )}
        </nav>

        <div className="h-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {shown && (
            <section ref={panelRef} id={panelId} aria-label={shown.label} key={shown.id}>
              {/* Fixed inner width, so the text does not re-wrap while the pill is still growing. */}
              <div ref={setBody} className="p-4" style={{ width: expandedWidth - RAIL_WIDTH }}>
                <Enter visible={open}>
                  <h2 className="mb-3 flex items-center gap-2 ps-1 text-base font-medium">
                    <shown.icon strokeWidth={2} />
                    {shown.title ?? shown.label}
                  </h2>
                  {shown.content}
                </Enter>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Content fades in a beat after the pill starts growing, and out quickly when it collapses. */
function Enter({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const on = mounted && visible;
  return <div className={cn('transition-opacity ease-out', on ? 'opacity-100 delay-100 duration-200' : 'opacity-0 duration-100')}>{children}</div>;
}
