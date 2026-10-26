import { Search } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { LayoutAlignRightIcon } from '@hugeicons/core-free-icons';
import { useId, type ComponentType } from 'react';
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

export const HOME_NAV_WIDTH = 200;

/** Home nav. Panel items highlight via `active`; no flyout overlays. */
export function HomeSidebar({
  label,
  items,
  active,
  onSearch,
  busy,
  open,
  onClose,
}: {
  label: string;
  items: SidebarItem[];
  active: string | null;
  onSearch: () => void;
  busy?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const regionId = useId();

  const side = document.dir === 'rtl' ? 'left' : 'right';
  return (
    <aside
      data-tw=""
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      className="relative z-0 h-full shrink-0 overflow-hidden motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ width: open ? HOME_NAV_WIDTH : 0 }}
    >
      <div className="flex h-full flex-col" style={{ width: HOME_NAV_WIDTH }}>
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        <img src={homeMark} alt="" width={28} height={28} className="home-mark box-border size-9 shrink-0 object-contain p-1.5 opacity-90" aria-hidden />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" className="hidden size-9 shrink-0 rounded-[8px] text-muted-foreground hover:text-foreground [&_svg]:size-[18px]" aria-label="Search" onClick={onSearch}>
              <Search strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={side}>Search</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              data-home-nav-close=""
              className="ms-auto size-9 shrink-0 rounded-[8px] px-2.5 py-0 text-muted-foreground hover:text-foreground [&_svg]:size-[18px]"
              aria-label="Close navigation"
              aria-expanded={open}
              aria-controls={regionId}
              onClick={onClose}
            >
              <HugeiconsIcon icon={LayoutAlignRightIcon} strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={side}>Close navigation</TooltipContent>
        </Tooltip>
      </div>

      <nav
        id={regionId}
        aria-label={label}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-2 pt-1',
        )}
      >
        {items.map((item) => {
          const isActive = active === item.id;
          const button = (
            <Button
              variant="ghost"
              aria-current={isActive ? 'page' : undefined}
              disabled={busy && item.id !== 'chat'}
              className={cn(
                'min-h-9 rounded-[var(--r-lg)] text-[color:var(--fg-2)] transition-colors duration-150',
                '[&_svg]:shrink-0 [&_svg]:text-current',
                'hover:bg-secondary hover:text-foreground',
                'focus-visible:bg-secondary focus-visible:text-foreground',
                isActive && 'bg-secondary text-foreground',
                'h-auto w-full justify-start gap-1.5 px-2.5 py-2 has-[>[data-icon=inline-start]]:ps-2.5 has-[>[data-icon=inline-end]]:pe-2.5',
              )}
              onClick={() => item.onSelect?.()}
            >
              <item.icon strokeWidth={2} className="size-[1.5cap] [block-size:1.5cap] [inline-size:1.5cap]" />
              <span className="truncate text-xs font-medium leading-none">{item.label}</span>
            </Button>
          );
          return <div key={item.id}>{button}</div>;
        })}
      </nav>
      </div>
    </aside>
  );
}
