import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Icon,
  Search,
  SidePanelClose,
  SidePanelOpen,
  type LimeIcon,
} from '@/components/lime/icon';
import { Button } from '@/components/lime/ui/button';
import { List, ListItem, ListIcon } from '@/components/lime/ui/list';
import { Separator } from '@/components/lime/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/lime/ui/tooltip';
import { cn } from '@/lib/lime/utils';

export interface SidebarItem {
  id: string;
  label: string;
  icon: LimeIcon;
  /** Shown under the item while it is open. Without it the item is a plain action. */
  content?: ReactNode;
  /** A plain action: runs when the item is chosen. */
  onSelect?: () => void;
  /** Draw a divider above this item. */
  dividerBefore?: boolean;
}

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

/** The home screen's navigation. Expanded: a List with labels; collapsed: a slim icon rail. */
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

  useEffect(() => {
    if (active && collapsed) setCollapsed(false);
  }, [active, collapsed]);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => asideRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [active]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !active || busy || document.querySelector('[role="menu"]')) return;
    e.preventDefault();
    onActiveChange(null);
    buttons.current[active]?.focus();
  };

  const tipSide = document.dir === 'rtl' ? 'left' : 'right';

  return (
    <aside
      ref={asideRef}
      data-state={collapsed ? 'collapsed' : 'expanded'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden border-e border-line bg-surface motion-safe:transition-[width] motion-safe:duration-(--dur-base) motion-safe:ease-out',
        collapsed ? 'w-14' : 'w-64',
      )}
    >
      <div className={cn('flex shrink-0 gap-1 p-2', collapsed ? 'flex-col items-center' : 'h-14 items-center')}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                aria-controls={regionId}
                onClick={toggle}
              />
            }
          >
            <Icon icon={collapsed ? SidePanelOpen : SidePanelClose} size={20} />
          </TooltipTrigger>
          <TooltipContent side={tipSide}>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className={cn(!collapsed && 'ms-auto')}
                aria-label="Search"
                onClick={onSearch}
              />
            }
          >
            <Icon icon={Search} size={20} />
          </TooltipTrigger>
          <TooltipContent side={tipSide}>Search</TooltipContent>
        </Tooltip>
      </div>

      <nav id={regionId} aria-label={label} className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain pb-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-0.5 px-2">
            {items.map((item) => (
              <div key={item.id} className="flex w-full flex-col items-center gap-0.5">
                {item.dividerBefore && <Separator className="my-1.5 w-full" />}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        ref={(node: HTMLButtonElement | null) => {
                          buttons.current[item.id] = node;
                        }}
                        variant="ghost"
                        size="icon"
                        aria-label={item.label}
                        aria-expanded={item.content ? item.id === active : undefined}
                        onClick={() => (item.content ? onActiveChange(item.id === active ? null : item.id) : item.onSelect?.())}
                      />
                    }
                  >
                    <Icon icon={item.icon} size={20} />
                  </TooltipTrigger>
                  <TooltipContent side={tipSide}>{item.label}</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        ) : (
          <List variant="plain" className="-mx-0">
            {items.map((item) => {
              const isActive = !!item.content && item.id === active;
              return (
                <div key={item.id} className="flex flex-col">
                  {item.dividerBefore && <Separator className="mx-4 my-1" />}
                  <ListItem
                    leading={<ListIcon icon={item.icon} tone={isActive ? 'accent' : 'neutral'} />}
                    title={item.label}
                    chevron={!!item.content}
                    onClick={() => (item.content ? onActiveChange(item.id === active ? null : item.id) : item.onSelect?.())}
                    ref={(node: HTMLLIElement | null) => {
                      buttons.current[item.id] = node?.querySelector<HTMLButtonElement>('[data-slot="list-row"]') ?? null;
                    }}
                  />
                  {isActive && item.content ? (
                    <li className="list-none px-4 pb-3">
                      <section aria-label={item.label}>{item.content}</section>
                    </li>
                  ) : null}
                </div>
              );
            })}
          </List>
        )}
      </nav>
    </aside>
  );
}
