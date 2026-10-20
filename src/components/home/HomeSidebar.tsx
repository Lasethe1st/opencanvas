import { PanelLeft, PanelRight, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface SidebarItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Shown under the item while it is open. Without it the item is a plain action. */
  content?: ReactNode;
  /** A plain action: runs when the item is chosen. */
  onSelect?: () => void;
  /** Draw a divider above this item. */
  dividerBefore?: boolean;
}

const EXPANDED = 256;
const COLLAPSED = 56;
const STORAGE_KEY = 'oc-home-sidebar';

function initialCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved === 'collapsed';
  } catch {
    /* storage blocked */
  }
  return window.innerWidth < 768;
}

/** The home screen's navigation. Expanded: icons with labels, and the open item's content right under it. Collapsed: a slim icon rail. */
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
  /** The open item's id, or null. */
  active: string | null;
  onActiveChange: (id: string | null) => void;
  /** The search icon at the top: opens the search overlay. */
  onSearch: () => void;
  /** While true, Escape does not close the open item. */
  busy?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const regionId = useId();
  const asideRef = useRef<HTMLElement>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      /* storage blocked */
    }
  };

  // Opening an item (a click on the rail, or Ctrl+K) expands the sidebar to show it.
  useEffect(() => {
    if (active && collapsed) setCollapsed(false);
  }, [active, collapsed]);

  // Opening an item moves focus to its primary field.
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => asideRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [active]);

  // Escape closes the open item and returns focus to the button that opened it.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !active || busy || document.querySelector('[role="menu"]')) return;
    e.preventDefault();
    onActiveChange(null);
    buttons.current[active]?.focus();
  };

  return (
    <aside
      ref={asideRef}
      data-tw=""
      data-state={collapsed ? 'collapsed' : 'expanded'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex h-full shrink-0 flex-col overflow-hidden border-e border-border bg-card motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ width: collapsed ? COLLAPSED : EXPANDED }}
    >
      <div className={cn('flex shrink-0 gap-1 p-2.5', collapsed ? 'flex-col items-center' : 'h-14 items-center')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" className="size-9 shrink-0 rounded-[8px] [&_svg]:size-[18px]" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls={regionId} onClick={toggle}>
              {collapsed ? <PanelLeft strokeWidth={2} /> : <PanelRight strokeWidth={2} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side={document.dir === 'rtl' ? 'left' : 'right'}>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" className={cn('size-9 shrink-0 rounded-[8px] [&_svg]:size-[18px]', !collapsed && 'ms-auto')} aria-label="Search" onClick={onSearch}>
              <Search strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={document.dir === 'rtl' ? 'left' : 'right'}>Search</TooltipContent>
        </Tooltip>
      </div>

      <nav id={regionId} aria-label={label} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden overscroll-contain px-2.5 pb-3">
        {items.map((item) => {
          const isActive = !!item.content && item.id === active && !collapsed;
          const button = (
            <Button
              ref={(node) => {
                buttons.current[item.id] = node;
              }}
              variant="ghost"
              aria-label={collapsed ? item.label : undefined}
              aria-expanded={item.content ? isActive : undefined}
              className={cn('h-auto w-full justify-start gap-2 rounded-[8px] px-[9px] py-2 [&_svg]:size-[18px] [&_svg]:shrink-0', isActive && 'bg-secondary text-foreground [&_svg]:text-foreground')}
              onClick={() => (item.content ? onActiveChange(item.id === active ? null : item.id) : item.onSelect?.())}
            >
              <item.icon strokeWidth={2} />
              {!collapsed && <span className="truncate text-[11.5px] font-normal">{item.label}</span>}
            </Button>
          );
          return (
            <div key={item.id} className="flex flex-col gap-0.5">
              {item.dividerBefore && <Separator className="my-1.5" />}
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side={document.dir === 'rtl' ? 'left' : 'right'}>{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                button
              )}
              {isActive && (
                <section aria-label={item.label} className="px-1 pb-2 pt-1">
                  {item.content}
                </section>
              )}
            </div>
          );
        })}
      </nav>

    </aside>
  );
}
