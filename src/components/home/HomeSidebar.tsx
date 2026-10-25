import { PanelLeft, PanelRight, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import homeMark from '../../assets/home-mark.png';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface SidebarItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Shown in a right-side flyout while hovered / focused. Without it the item is a plain action. */
  content?: ReactNode;
  /** A plain action: runs when the item is chosen. */
  onSelect?: () => void;
}

const EXPANDED = 256;
const COLLAPSED = 56;
const STORAGE_KEY = 'oc-home-sidebar';
/** Gap from the nav’s right edge to the flyout — slightly larger when collapsed so the panel clears the rail. */
const FLYOUT_GAP = 4;
const FLYOUT_GAP_COLLAPSED = 8;

function initialCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved === 'collapsed';
  } catch {
    /* storage blocked */
  }
  return window.innerWidth < 768;
}

/** Home nav. Items with content open a dark flyout immediately to the right on hover. */
export function HomeSidebar({
  label,
  items,
  active,
  onActiveChange,
  onSearch,
  busy,
}: {
  label: string;
  items: SidebarItem[];
  active: string | null;
  onActiveChange: (id: string | null) => void;
  onSearch: () => void;
  busy?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [flyoutId, setFlyoutId] = useState<string | null>(null);
  const [flyoutRect, setFlyoutRect] = useState<DOMRect | null>(null);
  const regionId = useId();
  const asideRef = useRef<HTMLElement>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      /* storage blocked */
    }
  };

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      setFlyoutId(null);
      setFlyoutRect(null);
      onActiveChange(null);
    }, 120);
  };

  const openFlyout = (id: string) => {
    clearClose();
    const el = buttons.current[id];
    if (!el) return;
    setFlyoutRect(el.getBoundingClientRect());
    setFlyoutId(id);
    onActiveChange(id);
  };

  useEffect(() => {
    if (!flyoutId) return;
    const onMove = () => {
      const el = buttons.current[flyoutId];
      if (el) setFlyoutRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [flyoutId]);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-home-flyout] [data-autofocus]')?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active, flyoutId]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || busy || document.querySelector('[role="menu"]')) return;
    if (!flyoutId && !active) return;
    e.preventDefault();
    const prev = flyoutId ?? active;
    setFlyoutId(null);
    setFlyoutRect(null);
    onActiveChange(null);
    if (prev) buttons.current[prev]?.focus();
  };

  const flyoutItem = items.find((i) => i.id === flyoutId && i.content);

  return (
    <aside
      ref={asideRef}
      data-tw=""
      data-state={collapsed ? 'collapsed' : 'expanded'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className="relative z-20 flex h-full shrink-0 flex-col overflow-visible border-e border-border bg-card/80 backdrop-blur-[20px] backdrop-saturate-150 motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ width: collapsed ? COLLAPSED : EXPANDED }}
    >
      <div className={cn('flex shrink-0 gap-1 px-2 pt-2 pb-0', collapsed ? 'flex-col items-center' : 'h-14 items-center')}>
        {!collapsed && (
          <img
            src={homeMark}
            alt=""
            width={28}
            height={28}
            className="home-mark box-border size-9 shrink-0 object-contain p-1.5 opacity-90"
            aria-hidden
          />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" className="hidden size-9 shrink-0 rounded-[8px] text-muted-foreground hover:text-foreground [&_svg]:size-[18px]" aria-label="Search" onClick={onSearch}>
              <Search strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={document.dir === 'rtl' ? 'left' : 'right'}>Search</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'size-9 shrink-0 rounded-[8px] px-2.5 py-0 text-muted-foreground hover:text-foreground [&_svg]:size-[18px]',
                !collapsed && 'ms-auto',
              )}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              aria-controls={regionId}
              onClick={toggle}
            >
              {collapsed ? <PanelLeft strokeWidth={2} /> : <PanelRight strokeWidth={2} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side={document.dir === 'rtl' ? 'left' : 'right'}>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
        </Tooltip>
      </div>

      <nav
        id={regionId}
        aria-label={label}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-2 pt-1',
          collapsed ? 'items-center px-0' : 'px-2',
        )}
      >
        {items.map((item) => {
          const isOpen = flyoutId === item.id;
          const button = (
            <Button
              ref={(node) => {
                buttons.current[item.id] = node;
              }}
              variant="ghost"
              aria-label={collapsed ? item.label : undefined}
              aria-expanded={item.content ? isOpen : undefined}
              aria-haspopup={item.content ? 'dialog' : undefined}
              className={cn(
                'min-h-9 rounded-[var(--r-lg)] text-[color:var(--fg-2)] transition-colors duration-150',
                '[&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-current',
                'hover:bg-secondary hover:text-foreground',
                'focus-visible:bg-secondary focus-visible:text-foreground',
                isOpen && 'bg-secondary text-foreground',
                collapsed
                  ? 'size-9 shrink-0 justify-center p-0'
                  : 'h-auto w-full justify-start gap-2 px-2.5 py-2 has-[>[data-icon=inline-start]]:ps-2.5 has-[>[data-icon=inline-end]]:pe-2.5',
              )}
              onMouseEnter={() => {
                if (item.content) openFlyout(item.id);
              }}
              onMouseLeave={() => {
                if (item.content) scheduleClose();
              }}
              onFocus={() => {
                if (item.content) openFlyout(item.id);
              }}
              onClick={() => {
                if (item.content) {
                  if (isOpen) {
                    setFlyoutId(null);
                    setFlyoutRect(null);
                    onActiveChange(null);
                  } else openFlyout(item.id);
                  return;
                }
                item.onSelect?.();
              }}
            >
              <item.icon strokeWidth={1.75} />
              {!collapsed && <span className="truncate text-xs font-medium leading-none">{item.label}</span>}
            </Button>
          );
          return (
            <div key={item.id} className={cn('flex flex-col gap-1', collapsed && 'items-center')}>
              {collapsed && !item.content ? (
                <Tooltip>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side={document.dir === 'rtl' ? 'left' : 'right'} sideOffset={collapsed ? FLYOUT_GAP_COLLAPSED : FLYOUT_GAP}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              ) : (
                button
              )}
            </div>
          );
        })}
      </nav>

      {flyoutItem &&
        flyoutRect &&
        createPortal(
          <div
            data-tw=""
            data-home-flyout=""
            role="dialog"
            aria-label={flyoutItem.label}
            className="fixed z-[100] flex max-h-[min(70vh,560px)] w-[min(320px,calc(100vw-72px))] flex-col overflow-hidden rounded-3xl border-0 bg-card/80 text-foreground shadow-[var(--shadow-md)] backdrop-blur-[20px] backdrop-saturate-150"
            style={{
              top: Math.min(flyoutRect.top, window.innerHeight - 24),
              left:
                (asideRef.current?.getBoundingClientRect().right ?? flyoutRect.right) +
                (collapsed ? FLYOUT_GAP_COLLAPSED : FLYOUT_GAP),
              transform: flyoutRect.top > window.innerHeight - 200 ? 'translateY(-40%)' : undefined,
            }}
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">{flyoutItem.content}</div>
          </div>,
          document.body,
        )}
    </aside>
  );
}
