import { PanelLeft, PanelRight, Search } from 'lucide-react';
import { useId, useState, type ComponentType } from 'react';
import homeMark from '../../assets/home-mark.png';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface SidebarItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Runs when the item is chosen (opens a right panel, starts a chat, etc.). */
  onSelect?: () => void;
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

/** Home nav. Panel items highlight via `active`; no flyout overlays. */
export function HomeSidebar({
  label,
  items,
  active,
  onSearch,
  busy,
}: {
  label: string;
  items: SidebarItem[];
  active: string | null;
  onSearch: () => void;
  busy?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const regionId = useId();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      /* storage blocked */
    }
  };

  return (
    <aside
      data-tw=""
      data-state={collapsed ? 'collapsed' : 'expanded'}
      aria-label={label}
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
          const isActive = active === item.id;
          const button = (
            <Button
              variant="ghost"
              aria-label={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              disabled={busy && item.id !== 'chat'}
              className={cn(
                'min-h-9 rounded-[var(--r-lg)] text-[color:var(--fg-2)] transition-colors duration-150',
                '[&_svg]:shrink-0 [&_svg]:text-current',
                'hover:bg-secondary hover:text-foreground',
                'focus-visible:bg-secondary focus-visible:text-foreground',
                isActive && 'bg-secondary text-foreground',
                collapsed
                  ? 'size-9 shrink-0 justify-center p-0'
                  : 'h-auto w-full justify-start gap-1.5 px-2.5 py-2 has-[>[data-icon=inline-start]]:ps-2.5 has-[>[data-icon=inline-end]]:pe-2.5',
              )}
              onClick={() => item.onSelect?.()}
            >
              <item.icon strokeWidth={2} className="size-[1.5cap] [block-size:1.5cap] [inline-size:1.5cap]" />
              {!collapsed && <span className="truncate text-xs font-medium leading-none">{item.label}</span>}
            </Button>
          );
          return (
            <div key={item.id} className={cn('flex flex-col gap-1', collapsed && 'items-center')}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side={document.dir === 'rtl' ? 'left' : 'right'}>{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                button
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
